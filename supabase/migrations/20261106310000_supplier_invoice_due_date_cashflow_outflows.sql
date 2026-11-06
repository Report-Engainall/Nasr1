-- NASR1-SUPPLIER-INVOICE-DUE-DATE-CASHFLOW-001
-- Persist source-attested supplier due dates and add verified receipt-backed OUTFLOW rows.
-- Only fully invoiced, exactly matched, zero-tax receipts with a saved supplier document attachment
-- are eligible. Ambiguous allocations, unposted payment drafts, variance/tax work and un-dated
-- open receipts make the schedule PARTIAL; no payment term or due date is inferred.

BEGIN;

CREATE TABLE public.purchase_supplier_invoice_due_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  due_date date NOT NULL,
  source_evidence_id uuid NOT NULL,
  source_reference text NOT NULL CHECK (char_length(btrim(source_reference)) BETWEEN 3 AND 200),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  recorded_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,invoice_id),
  UNIQUE (organization_id,idempotency_key),
  FOREIGN KEY (organization_id,invoice_id)
    REFERENCES public.purchase_supplier_invoices(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,source_evidence_id)
    REFERENCES public.purchase_supplier_invoice_evidence(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX purchase_supplier_invoice_due_dates_due_idx
  ON public.purchase_supplier_invoice_due_dates(organization_id,due_date,invoice_id);
ALTER TABLE public.purchase_supplier_invoice_due_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_supplier_invoice_due_dates_finance_read
  ON public.purchase_supplier_invoice_due_dates FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true)
  );
GRANT SELECT ON public.purchase_supplier_invoice_due_dates TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.purchase_supplier_invoice_due_dates FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_supplier_invoice_due_date_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice due-date evidence is append-only';
END;
$function$;
CREATE TRIGGER purchase_supplier_invoice_due_dates_immutable
  BEFORE UPDATE OR DELETE ON public.purchase_supplier_invoice_due_dates
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_invoice_due_date_immutable();
REVOKE ALL ON FUNCTION public.guard_supplier_invoice_due_date_immutable() FROM PUBLIC,anon,authenticated;

ALTER TABLE public.purchase_supplier_invoice_events
  DROP CONSTRAINT IF EXISTS purchase_supplier_invoice_events_action_check;
ALTER TABLE public.purchase_supplier_invoice_events
  ADD CONSTRAINT purchase_supplier_invoice_events_action_check
  CHECK (action IN ('recorded_matched','recorded_variance_pending','variance_approved','variance_rejected','due_date_recorded'));

CREATE OR REPLACE FUNCTION public.record_purchase_supplier_invoice_due_date(
  p_invoice_id uuid,
  p_due_date date,
  p_source_evidence_id uuid,
  p_source_reference text,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_invoice public.purchase_supplier_invoices%ROWTYPE;
  v_existing public.purchase_supplier_invoice_due_dates%ROWTYPE;
  v_row public.purchase_supplier_invoice_due_dates%ROWTYPE;
  v_reference text:=btrim(coalesce(p_source_reference,''));
  v_reason text:=btrim(coalesce(p_reason,''));
  v_fingerprint text;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to record supplier invoice due date';
  END IF;
  IF p_invoice_id IS NULL OR p_due_date IS NULL OR p_source_evidence_id IS NULL
     OR p_idempotency_key IS NULL
     OR char_length(v_reference) NOT BETWEEN 3 AND 200
     OR char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice due-date evidence is incomplete';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('supplier-invoice-due-date:'||p_invoice_id::text));
  SELECT i.* INTO v_invoice
  FROM public.purchase_supplier_invoices i
  WHERE i.id=p_invoice_id AND i.organization_id=v_org
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier invoice is not available in this organization';
  END IF;
  IF v_invoice.match_status<>'matched' OR v_invoice.tax_amount<>0 THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='cashflow due date requires a fully matched supplier invoice with no unresolved tax or price variance';
  END IF;
  IF p_due_date<v_invoice.invoice_date OR p_due_date>v_invoice.invoice_date+interval '10 years' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice due date must be on/after invoice date and within ten years';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_supplier_invoice_evidence e
    WHERE e.id=p_source_evidence_id AND e.organization_id=v_org AND e.invoice_id=v_invoice.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='due date must be supported by an attached source document for this invoice';
  END IF;

  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_array(
    p_invoice_id,p_due_date,p_source_evidence_id,v_reference,v_reason
  )::text);

  SELECT d.* INTO v_existing
  FROM public.purchase_supplier_invoice_due_dates d
  WHERE d.organization_id=v_org AND d.idempotency_key=p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='supplier due-date idempotency key was reused with a changed payload';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id',v_existing.id,'invoice_id',v_existing.invoice_id,'due_date',v_existing.due_date,
      'source_evidence_id',v_existing.source_evidence_id,'source_reference',v_existing.source_reference,
      'reason',v_existing.reason,'recorded_by_profile_id',v_existing.recorded_by_profile_id,
      'recorded_at',v_existing.recorded_at,'replayed',true
    );
  END IF;

  SELECT d.* INTO v_existing
  FROM public.purchase_supplier_invoice_due_dates d
  WHERE d.organization_id=v_org AND d.invoice_id=v_invoice.id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='supplier invoice already has a different immutable due-date source';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id',v_existing.id,'invoice_id',v_existing.invoice_id,'due_date',v_existing.due_date,
      'source_evidence_id',v_existing.source_evidence_id,'source_reference',v_existing.source_reference,
      'reason',v_existing.reason,'recorded_by_profile_id',v_existing.recorded_by_profile_id,
      'recorded_at',v_existing.recorded_at,'replayed',true
    );
  END IF;

  INSERT INTO public.purchase_supplier_invoice_due_dates(
    organization_id,invoice_id,due_date,source_evidence_id,source_reference,reason,
    idempotency_key,payload_fingerprint,recorded_by_profile_id
  ) VALUES (
    v_org,v_invoice.id,p_due_date,p_source_evidence_id,v_reference,v_reason,
    p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING * INTO v_row;

  INSERT INTO public.purchase_supplier_invoice_events(
    organization_id,invoice_id,actor_profile_id,action,reason,details
  ) VALUES (
    v_org,v_invoice.id,v_actor,'due_date_recorded',v_reason,
    pg_catalog.jsonb_build_object(
      'due_date',p_due_date,'due_date_evidence_id',v_row.id,
      'source_evidence_id',p_source_evidence_id,'source_reference',v_reference
    )
  );

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  ) VALUES (
    v_org,v_actor,'supplier_invoice.due_date_recorded','supplier_invoice',v_invoice.id,
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'due_date',p_due_date,'due_date_evidence_id',v_row.id,
      'source_evidence_id',p_source_evidence_id,'source_reference',v_reference
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id',v_row.id,'invoice_id',v_row.invoice_id,'due_date',v_row.due_date,
    'source_evidence_id',v_row.source_evidence_id,'source_reference',v_row.source_reference,
    'reason',v_row.reason,'recorded_by_profile_id',v_row.recorded_by_profile_id,
    'recorded_at',v_row.recorded_at,'replayed',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.record_purchase_supplier_invoice_due_date(uuid,date,uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_purchase_supplier_invoice_due_date(uuid,date,uuid,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_purchase_supplier_invoice_due_dates(
  p_invoice_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_rows jsonb;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read supplier invoice due dates';
  END IF;
  IF p_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.purchase_supplier_invoices i
    WHERE i.id=p_invoice_id AND i.organization_id=v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier invoice is not available in this organization';
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',d.id,'invoice_id',d.invoice_id,'due_date',d.due_date,
    'source_evidence_id',d.source_evidence_id,'source_reference',d.source_reference,
    'reason',d.reason,'recorded_by_profile_id',d.recorded_by_profile_id,'recorded_at',d.recorded_at
  ) ORDER BY d.due_date,d.invoice_id),'[]'::jsonb)
  INTO v_rows
  FROM public.purchase_supplier_invoice_due_dates d
  WHERE d.organization_id=v_org AND (p_invoice_id IS NULL OR d.invoice_id=p_invoice_id);
  RETURN v_rows;
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_purchase_supplier_invoice_due_dates(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_supplier_invoice_due_dates(uuid) TO authenticated;

-- Resolve an invoice due date only when every item in a receipt is fully invoiced by
-- exactly one matched, zero-tax supplier invoice and its due-date document is attached.
CREATE OR REPLACE FUNCTION public.supplier_invoice_verified_due_receipts(
  p_organization_id uuid,
  p_currency text DEFAULT NULL
)
RETURNS TABLE (
  receipt_id uuid, receipt_number text, supplier_id uuid, supplier_name text, currency text,
  invoice_id uuid, invoice_number text, invoice_created_at timestamptz,
  due_date date, due_date_evidence_id uuid, due_date_recorded_at timestamptz,
  outstanding_payable numeric, source_journal_entry_id uuid, receipt_date date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
WITH open_receipts AS MATERIALIZED (
  SELECT r.*
  FROM public.supplier_payment_open_receipts(p_organization_id,NULL,p_currency) r
  WHERE r.outstanding_payable>0
),
item_invoice_coverage AS (
  SELECT
    ri.id AS receipt_item_id,ri.receipt_id,ri.quantity_received,
    count(DISTINCT line.invoice_id)::integer AS invoice_count,
    (array_agg(line.invoice_id ORDER BY line.invoice_id))[1] AS invoice_id,
    coalesce(sum(line.invoiced_quantity),0)::numeric(15,3) AS invoiced_quantity
  FROM public.purchase_receipt_items ri
  LEFT JOIN public.purchase_supplier_invoice_lines line
    ON line.organization_id=ri.organization_id AND line.receipt_item_id=ri.id
   AND EXISTS (
     SELECT 1 FROM public.purchase_supplier_invoices active_invoice
     WHERE active_invoice.organization_id=line.organization_id
       AND active_invoice.id=line.invoice_id
       AND active_invoice.match_status<>'variance_rejected'
   )
  WHERE ri.organization_id=p_organization_id
  GROUP BY ri.id,ri.receipt_id,ri.quantity_received
),
receipt_coverage AS (
  SELECT
    c.receipt_id,count(*)::integer AS item_count,
    count(*) FILTER (
      WHERE c.invoice_count=1 AND c.invoiced_quantity=c.quantity_received
    )::integer AS fully_billed_item_count,
    count(DISTINCT c.invoice_id)::integer AS invoice_count,
    (array_agg(c.invoice_id ORDER BY c.invoice_id))[1] AS invoice_id
  FROM item_invoice_coverage c
  GROUP BY c.receipt_id
),
ready AS (
  SELECT
    o.receipt_id,o.receipt_number,o.supplier_id,o.supplier_name,o.currency,
    i.id AS invoice_id,i.supplier_invoice_number AS invoice_number,i.created_at AS invoice_created_at,
    d.due_date,d.id AS due_date_evidence_id,d.recorded_at AS due_date_recorded_at,
    o.outstanding_payable,o.source_journal_entry_id,o.receipt_date
  FROM open_receipts o
  JOIN receipt_coverage c ON c.receipt_id=o.receipt_id
    AND c.invoice_count=1 AND c.item_count=c.fully_billed_item_count
  JOIN public.purchase_supplier_invoices i
    ON i.id=c.invoice_id AND i.organization_id=p_organization_id
    AND i.supplier_id=o.supplier_id AND i.currency=o.currency
    AND i.match_status='matched' AND i.tax_amount=0
  JOIN public.purchase_supplier_invoice_due_dates d
    ON d.invoice_id=i.id AND d.organization_id=i.organization_id
  WHERE o.reserved_payment_total=o.posted_payment_total
    AND EXISTS (
      SELECT 1 FROM public.purchase_supplier_invoice_evidence evidence
      WHERE evidence.organization_id=i.organization_id AND evidence.invoice_id=i.id
        AND evidence.id=d.source_evidence_id
    )
)
SELECT
  ready.receipt_id,ready.receipt_number,ready.supplier_id,ready.supplier_name,ready.currency,
  ready.invoice_id,ready.invoice_number,ready.invoice_created_at,
  ready.due_date,ready.due_date_evidence_id,ready.due_date_recorded_at,
  ready.outstanding_payable,ready.source_journal_entry_id,ready.receipt_date
FROM ready
$function$;
REVOKE ALL ON FUNCTION public.supplier_invoice_verified_due_receipts(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fetch_supplier_payable_cashflow_schedule(
  p_from date,
  p_to date,
  p_as_of timestamptz,
  p_currency text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_role text;
  v_period jsonb;
  v_entries jsonb:='[]'::jsonb;
  v_evidence jsonb:='[]'::jsonb;
  v_unresolved integer:=0;
  v_overdue integer:=0;
  v_currency text:=nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_currency,''))),'');
  v_today date;
  v_now timestamptz:=statement_timestamp();
BEGIN
  SELECT p.organization_id,r.role INTO v_org,v_role
  FROM public.profiles p
  JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    AND r.role IN ('admin','manager')
  ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END
  LIMIT 1;
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required for supplier payable schedule';
  END IF;
  v_today:=(p_as_of AT TIME ZONE 'UTC')::date;
  IF p_from IS NULL OR p_to IS NULL OR p_as_of IS NULL OR p_from>p_to
     OR p_from<v_today OR p_to>v_today+90
     OR p_as_of<v_now-interval '5 minutes' OR p_as_of>v_now+interval '1 minute'
     OR (v_currency IS NOT NULL AND v_currency !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier payable schedule period, currency or as-of snapshot is invalid';
  END IF;
  v_period:=pg_catalog.jsonb_build_object('from',p_from::text,'to',p_to::text);

  WITH open_receipts AS (
    SELECT * FROM public.supplier_payment_open_receipts(v_org,NULL,v_currency)
    WHERE outstanding_payable>0
  ),
  verified AS (
    SELECT * FROM public.supplier_invoice_verified_due_receipts(v_org,v_currency)
  )
  SELECT count(*)::integer INTO v_unresolved
  FROM open_receipts o
  WHERE NOT EXISTS (SELECT 1 FROM verified v WHERE v.receipt_id=o.receipt_id);

  SELECT count(*)::integer INTO v_overdue
  FROM public.supplier_invoice_verified_due_receipts(v_org,v_currency) v
  WHERE v.due_date<p_from;

  WITH verified AS (
    SELECT * FROM public.supplier_invoice_verified_due_receipts(v_org,v_currency)
  ),
  invoice_positions AS (
    SELECT
      invoice_id,invoice_number,invoice_created_at,supplier_id,supplier_name,currency,due_date,
      sum(outstanding_payable)::numeric(18,2) AS amount,
      (array_agg(due_date_evidence_id ORDER BY receipt_id))[1] AS due_date_evidence_id,
      min(due_date_recorded_at) AS due_date_recorded_at,
      (array_agg(receipt_id::text ORDER BY receipt_id))[1:98] AS receipt_ids
    FROM verified
    WHERE due_date BETWEEN p_from AND p_to
    GROUP BY invoice_id,invoice_number,invoice_created_at,supplier_id,supplier_name,currency,due_date
  )
  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id','supplier-invoice-outflow:'||p.invoice_id::text,
      'direction','OUTFLOW',
      'dueDate',p.due_date::text,
      'amount',pg_catalog.jsonb_build_object(
        'id','metric:supplier-payable:'||p.invoice_id::text,
        'key','supplier.payable.outstanding',
        'value',p.amount::text,
        'unit','CURRENCY',
        'currency',p.currency,
        'status','VERIFIED',
        'completeness','COMPLETE',
        'quality','ACCEPTABLE',
        'asOf',p_as_of,
        'lineage',pg_catalog.jsonb_build_object(
          'evidenceIds',
            pg_catalog.to_jsonb(ARRAY[
              'supplier-invoice:'||p.invoice_id::text,
              'supplier-invoice-due-date:'||p.due_date_evidence_id::text
            ]::text[] || ARRAY(
              SELECT 'supplier-receipt-open-payable:'||receipt_id
              FROM pg_catalog.unnest(p.receipt_ids) AS receipt_id
            )),
          'formulaId','nasr1.supplier-posted-payable-after-settlements',
          'formulaVersion','1'
        )
      )
    ) ORDER BY p.due_date,p.supplier_name,p.invoice_id
  ),'[]'::jsonb)
  INTO v_entries
  FROM invoice_positions p;

  WITH verified AS (
    SELECT * FROM public.supplier_invoice_verified_due_receipts(v_org,v_currency)
    WHERE due_date BETWEEN p_from AND p_to
  ),
  invoice_rows AS (
    SELECT DISTINCT invoice_id,invoice_number,invoice_created_at,currency
    FROM verified
  ),
  due_rows AS (
    SELECT DISTINCT due_date_evidence_id,invoice_id,due_date_recorded_at,currency
    FROM verified
  ),
  receipt_rows AS (
    SELECT DISTINCT receipt_id,source_journal_entry_id,receipt_date,currency
    FROM verified
  ),
  evidence_rows AS (
    SELECT
      'supplier-invoice:'||i.invoice_id::text AS id,
      pg_catalog.jsonb_build_object(
        'id','supplier-invoice:'||i.invoice_id::text,
        'source',pg_catalog.jsonb_build_object('kind','TABLE','name','purchase_supplier_invoices','recordId',i.invoice_id::text),
        'sourceTimestamp',i.invoice_created_at,'asOf',p_as_of,'period',v_period,'currency',i.currency,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
      ) AS payload
    FROM invoice_rows i
    UNION ALL
    SELECT
      'supplier-invoice-due-date:'||d.due_date_evidence_id::text,
      pg_catalog.jsonb_build_object(
        'id','supplier-invoice-due-date:'||d.due_date_evidence_id::text,
        'source',pg_catalog.jsonb_build_object('kind','TABLE','name','purchase_supplier_invoice_due_dates','recordId',d.due_date_evidence_id::text),
        'sourceTimestamp',d.due_date_recorded_at,'asOf',p_as_of,'period',v_period,'currency',d.currency,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
      )
    FROM due_rows d
    UNION ALL
    SELECT
      'supplier-receipt-open-payable:'||r.receipt_id::text,
      pg_catalog.jsonb_build_object(
        'id','supplier-receipt-open-payable:'||r.receipt_id::text,
        'source',pg_catalog.jsonb_build_object('kind','RPC','name','supplier_payment_open_receipts','recordId',r.receipt_id::text),
        'sourceTimestamp',p_as_of,'asOf',p_as_of,'period',v_period,'currency',r.currency,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
      )
    FROM receipt_rows r
  )
  SELECT coalesce(pg_catalog.jsonb_agg(payload ORDER BY id),'[]'::jsonb)
  INTO v_evidence FROM evidence_rows;

  RETURN pg_catalog.jsonb_build_object(
    'status',CASE WHEN v_unresolved=0 AND v_overdue=0 THEN 'OK' ELSE 'PARTIAL' END,
    'completeness',CASE WHEN v_unresolved=0 AND v_overdue=0 THEN 'COMPLETE' ELSE 'PARTIAL' END,
    'quality',CASE WHEN v_unresolved=0 AND v_overdue=0 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,
    'asOf',p_as_of,'period',v_period,'currency',v_currency,'sideEffects','NONE',
    'entries',v_entries,'evidenceRecords',v_evidence,
    'unresolvedReceiptCount',v_unresolved,'overdueReceiptCount',v_overdue,
    'warnings',CASE
      WHEN v_unresolved>0 AND v_overdue>0 THEN pg_catalog.jsonb_build_array(
        'Supplier outflow coverage is incomplete: open receipts lack a unique matched invoice due-date source, or payment drafts are not posted.',
        'Overdue supplier receipts exist outside the forward forecast window; they are not assigned a fabricated future date.'
      )
      WHEN v_unresolved>0 THEN pg_catalog.jsonb_build_array(
        'Supplier outflow coverage is incomplete: open receipts lack a unique matched zero-tax invoice, attached due-date source, full receipt-line coverage, or fully posted payment state.'
      )
      WHEN v_overdue>0 THEN pg_catalog.jsonb_build_array(
        'Overdue supplier receipts exist outside the forward forecast window; they are not assigned a fabricated future date.'
      )
      ELSE '[]'::jsonb
    END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_supplier_payable_cashflow_schedule(date,date,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_supplier_payable_cashflow_schedule(date,date,timestamptz,text) TO authenticated;

COMMENT ON TABLE public.purchase_supplier_invoice_due_dates IS
  'Append-only source-attested supplier invoice due dates. Each date is linked to an attached same-tenant invoice document.';

COMMIT;
