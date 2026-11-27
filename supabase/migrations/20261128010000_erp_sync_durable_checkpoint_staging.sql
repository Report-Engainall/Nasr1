BEGIN;

-- ERP staging is intentionally separate from operational products, stock, invoices,
-- customer balances and journals. It stores only a reviewed canonical projection.
CREATE TABLE public.erp_sync_checkpoints (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  scope_key text NOT NULL CHECK (scope_key ~ '^[0-9a-f]{64}$'),
  provider text NOT NULL CHECK (provider IN ('onyx_pro','al_mutakamel')),
  company_external_id text NOT NULL CHECK (length(btrim(company_external_id)) BETWEEN 1 AND 256),
  branch_external_id text NOT NULL CHECK (length(btrim(branch_external_id)) BETWEEN 1 AND 256),
  warehouse_external_id text,
  currency_code text,
  object_type text NOT NULL CHECK (object_type IN ('products','customers','warehouses','stock_balances','product_units','product_prices','customer_financial_documents','customer_payment_receipts','customer_statement_entries')),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  cursor_ciphertext text,
  pending_watermark timestamptz,
  completed_watermark timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (organization_id,scope_key),
  CHECK (warehouse_external_id IS NULL OR length(btrim(warehouse_external_id)) BETWEEN 1 AND 256),
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$')
);

CREATE TABLE public.erp_sync_staged_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  scope_key text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('onyx_pro','al_mutakamel')),
  object_type text NOT NULL CHECK (object_type IN ('products','customers','warehouses','stock_balances','product_units','product_prices','customer_financial_documents','customer_payment_receipts','customer_statement_entries')),
  external_id text NOT NULL CHECK (length(btrim(external_id)) BETWEEN 1 AND 256),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  source_updated_at timestamptz NOT NULL,
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields)='object'),
  first_seen_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (organization_id,scope_key,external_id),
  FOREIGN KEY (organization_id,scope_key)
    REFERENCES public.erp_sync_checkpoints(organization_id,scope_key) ON DELETE RESTRICT
);

CREATE INDEX erp_sync_staged_records_scope_updated_idx
  ON public.erp_sync_staged_records(organization_id,scope_key,source_updated_at DESC);

-- Append-only receipt ledger: one receipt per exact provider page fingerprint.
CREATE TABLE public.erp_sync_page_receipts (
  organization_id uuid NOT NULL,
  scope_key text NOT NULL,
  page_fingerprint text NOT NULL CHECK (page_fingerprint ~ '^[0-9a-f]{64}$'),
  response_sha256 text NOT NULL CHECK (response_sha256 ~ '^[0-9a-f]{64}$'),
  next_cursor_present boolean NOT NULL,
  http_status integer NOT NULL CHECK (http_status BETWEEN 200 AND 299),
  external_request_id text,
  pending_watermark timestamptz,
  completed_watermark timestamptz,
  records_received integer NOT NULL CHECK (records_received BETWEEN 0 AND 1000),
  created_count integer NOT NULL CHECK (created_count >= 0),
  updated_count integer NOT NULL CHECK (updated_count >= 0),
  unchanged_count integer NOT NULL CHECK (unchanged_count >= 0),
  rejected_count integer NOT NULL CHECK (rejected_count >= 0),
  conflicted_count integer NOT NULL CHECK (conflicted_count >= 0),
  completed boolean NOT NULL,
  committed_version bigint NOT NULL CHECK (committed_version > 0),
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (organization_id,scope_key,page_fingerprint),
  FOREIGN KEY (organization_id,scope_key)
    REFERENCES public.erp_sync_checkpoints(organization_id,scope_key) ON DELETE RESTRICT,
  CHECK (external_request_id IS NULL OR (
    length(external_request_id) BETWEEN 1 AND 128
    AND external_request_id !~ '[[:cntrl:]]'
  ))
);

CREATE INDEX erp_sync_page_receipts_recent_idx
  ON public.erp_sync_page_receipts(organization_id,scope_key,recorded_at DESC);

CREATE TABLE public.erp_sync_page_record_outcomes (
  organization_id uuid NOT NULL,
  scope_key text NOT NULL,
  page_fingerprint text NOT NULL,
  external_id text NOT NULL CHECK (length(btrim(external_id)) BETWEEN 1 AND 256),
  source_updated_at timestamptz NOT NULL,
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields)='object'),
  disposition text NOT NULL CHECK (disposition IN ('created','updated','unchanged','rejected','conflicted')),
  disposition_reason text CHECK (disposition_reason IN ('source_timestamp_older','same_timestamp_payload_mismatch')),
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (organization_id,scope_key,page_fingerprint,external_id),
  FOREIGN KEY (organization_id,scope_key,page_fingerprint)
    REFERENCES public.erp_sync_page_receipts(organization_id,scope_key,page_fingerprint) ON DELETE RESTRICT
);
CREATE INDEX erp_sync_page_record_outcomes_latest_idx
  ON public.erp_sync_page_record_outcomes(organization_id,scope_key,external_id,recorded_at DESC);

ALTER TABLE public.erp_sync_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_sync_checkpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE public.erp_sync_staged_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_sync_staged_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.erp_sync_page_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_sync_page_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.erp_sync_page_record_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_sync_page_record_outcomes FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.erp_sync_checkpoints FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.erp_sync_staged_records FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.erp_sync_page_receipts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.erp_sync_page_record_outcomes FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.erp_sync_checkpoints FROM service_role;
REVOKE ALL ON TABLE public.erp_sync_staged_records FROM service_role;
REVOKE ALL ON TABLE public.erp_sync_page_receipts FROM service_role;
REVOKE ALL ON TABLE public.erp_sync_page_record_outcomes FROM service_role;

COMMENT ON TABLE public.erp_sync_checkpoints IS
  'Server-only ERP cursor and watermark state. Cursor values are authenticated-encrypted by the server adapter before storage.';
COMMENT ON TABLE public.erp_sync_staged_records IS
  'Tenant-scoped, read-only ERP projection staging. Never posts or mutates operational stock, sales or financial ledgers.';
COMMENT ON TABLE public.erp_sync_page_receipts IS
  'Append-only page receipt/audit ledger for ERP sync replay, evidence and checkpoint commits.';
COMMENT ON TABLE public.erp_sync_page_record_outcomes IS
  'Append-only per-record ERP staging dispositions tied to a committed page receipt; contains no operational ledger posting.';

CREATE OR REPLACE FUNCTION public.load_erp_sync_checkpoint(
  p_organization_id uuid,
  p_scope_key text,
  p_provider text,
  p_company_external_id text,
  p_branch_external_id text,
  p_warehouse_external_id text,
  p_currency_code text,
  p_object_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_checkpoint public.erp_sync_checkpoints%ROWTYPE;
BEGIN
  IF p_organization_id IS NULL OR p_scope_key IS NULL OR p_scope_key !~ '^[0-9a-f]{64}$'
     OR p_provider IS NULL OR p_provider NOT IN ('onyx_pro','al_mutakamel')
     OR p_company_external_id IS NULL OR length(btrim(p_company_external_id)) NOT BETWEEN 1 AND 256
     OR p_branch_external_id IS NULL OR length(btrim(p_branch_external_id)) NOT BETWEEN 1 AND 256
     OR (p_warehouse_external_id IS NOT NULL AND length(btrim(p_warehouse_external_id)) NOT BETWEEN 1 AND 256)
     OR (p_currency_code IS NOT NULL AND p_currency_code !~ '^[A-Z]{3}$')
     OR p_object_type IS NULL OR p_object_type NOT IN ('products','customers','warehouses','stock_balances','product_units','product_prices','customer_financial_documents','customer_payment_receipts','customer_statement_entries')
  THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid ERP checkpoint scope is required';
  END IF;

  INSERT INTO public.erp_sync_checkpoints(
    organization_id,scope_key,provider,company_external_id,branch_external_id,
    warehouse_external_id,currency_code,object_type
  ) VALUES (
    p_organization_id,p_scope_key,p_provider,btrim(p_company_external_id),btrim(p_branch_external_id),
    nullif(btrim(coalesce(p_warehouse_external_id,'')),''),p_currency_code,p_object_type
  ) ON CONFLICT (organization_id,scope_key) DO NOTHING;

  SELECT c.* INTO v_checkpoint
    FROM public.erp_sync_checkpoints c
   WHERE c.organization_id=p_organization_id AND c.scope_key=p_scope_key
   FOR UPDATE;

  IF v_checkpoint.provider IS DISTINCT FROM p_provider
     OR v_checkpoint.company_external_id IS DISTINCT FROM btrim(p_company_external_id)
     OR v_checkpoint.branch_external_id IS DISTINCT FROM btrim(p_branch_external_id)
     OR v_checkpoint.warehouse_external_id IS DISTINCT FROM nullif(btrim(coalesce(p_warehouse_external_id,'')),'')
     OR v_checkpoint.currency_code IS DISTINCT FROM p_currency_code
     OR v_checkpoint.object_type IS DISTINCT FROM p_object_type
  THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='ERP checkpoint scope hash is already bound to different scope metadata';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'version',v_checkpoint.version,
    'cursor_ciphertext',v_checkpoint.cursor_ciphertext,
    'pending_watermark',v_checkpoint.pending_watermark,
    'completed_watermark',v_checkpoint.completed_watermark
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.persist_erp_sync_page_atomically(
  p_organization_id uuid,
  p_scope_key text,
  p_provider text,
  p_company_external_id text,
  p_branch_external_id text,
  p_warehouse_external_id text,
  p_currency_code text,
  p_object_type text,
  p_expected_version bigint,
  p_page_fingerprint text,
  p_http_status integer,
  p_external_request_id text,
  p_response_sha256 text,
  p_records jsonb,
  p_next_cursor_ciphertext text,
  p_pending_watermark timestamptz,
  p_completed_watermark timestamptz,
  p_completed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_checkpoint public.erp_sync_checkpoints%ROWTYPE;
  v_receipt public.erp_sync_page_receipts%ROWTYPE;
  v_record jsonb;
  v_record_field_count integer;
  v_fields jsonb;
  v_allowed_fields text[];
  v_invalid_field text;
  v_external_id text;
  v_idempotency_key text;
  v_source_updated_at timestamptz;
  v_existing_key text;
  v_existing_updated_at timestamptz;
  v_existing_fields jsonb;
  v_records_received integer;
  v_created integer:=0;
  v_updated integer:=0;
  v_unchanged integer:=0;
  v_rejected integer:=0;
  v_conflicted integer:=0;
  v_disposition text;
  v_disposition_reason text;
  v_outcomes jsonb:='[]'::jsonb;

BEGIN
  IF p_organization_id IS NULL OR p_scope_key IS NULL OR p_scope_key !~ '^[0-9a-f]{64}$'
     OR p_provider IS NULL OR p_provider NOT IN ('onyx_pro','al_mutakamel')
     OR p_company_external_id IS NULL OR length(btrim(p_company_external_id)) NOT BETWEEN 1 AND 256
     OR p_branch_external_id IS NULL OR length(btrim(p_branch_external_id)) NOT BETWEEN 1 AND 256
     OR (p_warehouse_external_id IS NOT NULL AND length(btrim(p_warehouse_external_id)) NOT BETWEEN 1 AND 256)
     OR (p_currency_code IS NOT NULL AND p_currency_code !~ '^[A-Z]{3}$')
     OR p_object_type IS NULL OR p_object_type NOT IN ('products','customers','warehouses','stock_balances','product_units','product_prices','customer_financial_documents','customer_payment_receipts','customer_statement_entries')
     OR p_expected_version IS NULL OR p_expected_version<0
     OR p_page_fingerprint IS NULL OR p_page_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_http_status IS NULL OR p_http_status NOT BETWEEN 200 AND 299
     OR p_response_sha256 IS NULL OR p_response_sha256 !~ '^[0-9a-f]{64}$'
     OR p_records IS NULL OR pg_catalog.jsonb_typeof(p_records) IS DISTINCT FROM 'array'
     OR (p_next_cursor_ciphertext IS NOT NULL AND (
          length(p_next_cursor_ciphertext) NOT BETWEEN 20 AND 8192
          OR left(p_next_cursor_ciphertext,3) IS DISTINCT FROM 'v1:'
        ))
     OR (p_external_request_id IS NOT NULL AND (
          length(p_external_request_id) NOT BETWEEN 1 AND 128
          OR p_external_request_id ~ '[[:cntrl:]]'
          OR p_external_request_id<>btrim(p_external_request_id)
        ))
     OR p_completed IS NULL
     OR (p_completed IS TRUE AND (p_next_cursor_ciphertext IS NOT NULL OR p_pending_watermark IS NOT NULL))
     OR (p_completed IS FALSE AND p_next_cursor_ciphertext IS NULL)
  THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid ERP page envelope and checkpoint metadata are required';
  END IF;

  v_records_received:=pg_catalog.jsonb_array_length(p_records);
  IF v_records_received>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP page exceeds the maximum accepted staging row count';
  END IF;

  v_allowed_fields:=CASE p_object_type
    WHEN 'products' THEN ARRAY['item_code','sku','barcode','name','name_en','description','category_code','category_name','brand_name','unit_code','unit_name','is_active']
    WHEN 'customers' THEN ARRAY['customer_code','business_name','phone','email','customer_status']
    WHEN 'warehouses' THEN ARRAY['warehouse_code','warehouse_name','is_active']
    WHEN 'stock_balances' THEN ARRAY['item_code','warehouse_code','quantity_on_hand','quantity_reserved','quantity_available']
    WHEN 'product_units' THEN ARRAY['item_code','unit_code','base_unit_code','conversion_factor','is_base_unit','is_active']
    WHEN 'product_prices' THEN ARRAY['item_code','price_list_code','customer_tier','currency_code','unit_code','unit_price','minimum_quantity','discount_percent','is_active']
    WHEN 'customer_financial_documents' THEN ARRAY['external_customer_id','document_number','document_type','document_status','issue_date','due_date','currency_code','total_amount','paid_amount','outstanding_amount','reference']
    WHEN 'customer_payment_receipts' THEN ARRAY['external_customer_id','receipt_number','receipt_date','currency_code','amount','payment_status','payment_method','applied_document_number','reference']
    WHEN 'customer_statement_entries' THEN ARRAY['external_customer_id','entry_reference','entry_date','due_date','currency_code','entry_type','debit_amount','credit_amount','source_document_number','description']
  END;

  -- Validate the entire source projection before acquiring the checkpoint lock or
  -- changing any staging row. The only accepted keys are object-specific safe fields.
  FOR v_record IN
    SELECT entry.value FROM pg_catalog.jsonb_array_elements(p_records) AS entry(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_record) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP staged record must be a JSON object';
    END IF;

    SELECT count(*) INTO v_record_field_count
      FROM pg_catalog.jsonb_object_keys(v_record);
    IF v_record_field_count<>4
       OR pg_catalog.jsonb_typeof(v_record->'external_id') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_record->'source_updated_at') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_record->'idempotency_key') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_record->'fields') IS DISTINCT FROM 'object'
    THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP staged record must contain its four canonical members';
    END IF;

    v_external_id:=v_record->>'external_id';
    v_idempotency_key:=v_record->>'idempotency_key';
    v_fields:=v_record->'fields';
    IF length(btrim(v_external_id)) NOT BETWEEN 1 AND 256
       OR v_idempotency_key !~ '^[0-9a-f]{64}$'
       OR pg_catalog.jsonb_typeof(v_fields) IS DISTINCT FROM 'object'
    THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP staged record identity is invalid';
    END IF;

    BEGIN
      IF (v_record->>'source_updated_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP source timestamp must be timezone-qualified ISO-8601 with microsecond precision';
      END IF;
      v_source_updated_at:=(v_record->>'source_updated_at')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP source timestamp is invalid';
    END;

    SELECT entry.key INTO v_invalid_field
      FROM pg_catalog.jsonb_each(v_fields) AS entry(key,value)
     WHERE NOT (entry.key=ANY(v_allowed_fields))
        OR pg_catalog.jsonb_typeof(entry.value) IN ('object','array')
     LIMIT 1;
    IF v_invalid_field IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP staged record contains an unapproved or nested field';
    END IF;
    v_invalid_field:=NULL;

    IF EXISTS (
      SELECT 1 FROM pg_catalog.unnest(
        CASE p_object_type
          WHEN 'products' THEN ARRAY['item_code','name']
          WHEN 'customers' THEN ARRAY['customer_code','business_name']
          WHEN 'warehouses' THEN ARRAY['warehouse_code','warehouse_name']
          WHEN 'stock_balances' THEN ARRAY['item_code','warehouse_code','quantity_on_hand','quantity_reserved','quantity_available']
          WHEN 'product_units' THEN ARRAY['item_code','unit_code','base_unit_code','conversion_factor','is_base_unit']
          WHEN 'product_prices' THEN ARRAY['item_code','price_list_code','currency_code','unit_price']
          WHEN 'customer_financial_documents' THEN ARRAY['external_customer_id','document_number','document_type','document_status','issue_date','currency_code','total_amount']
          WHEN 'customer_payment_receipts' THEN ARRAY['external_customer_id','receipt_number','receipt_date','currency_code','amount','payment_status']
          WHEN 'customer_statement_entries' THEN ARRAY['external_customer_id','entry_reference','entry_date','currency_code','entry_type','debit_amount','credit_amount']
        END
      ) AS required(field_name)
      WHERE NOT (v_fields ? required.field_name)
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP staged record is missing a required canonical field';
    END IF;

    IF p_object_type IN ('customer_financial_documents','customer_payment_receipts','customer_statement_entries') THEN
      IF jsonb_typeof(v_fields->'external_customer_id') IS DISTINCT FROM 'string'
         OR length(btrim(v_fields->>'external_customer_id')) NOT BETWEEN 1 AND 160
         OR (v_fields->>'external_customer_id') ~ '://'
         OR position('@' in v_fields->>'external_customer_id')>0
         OR jsonb_typeof(v_fields->'currency_code') IS DISTINCT FROM 'string'
         OR (v_fields->>'currency_code') !~ '^[A-Z]{3}$'
      THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP financial projection customer identity or currency is invalid';
      END IF;
    END IF;

    IF p_object_type='customer_financial_documents' THEN
      IF jsonb_typeof(v_fields->'document_number') IS DISTINCT FROM 'string'
         OR length(btrim(v_fields->>'document_number')) NOT BETWEEN 1 AND 160
         OR jsonb_typeof(v_fields->'document_type') IS DISTINCT FROM 'string'
         OR (v_fields->>'document_type') NOT IN ('invoice','credit_note','debit_note')
         OR jsonb_typeof(v_fields->'document_status') IS DISTINCT FROM 'string'
         OR (v_fields->>'document_status') NOT IN ('draft','posted','partial','paid','overdue','voided','cancelled','reversed')
         OR jsonb_typeof(v_fields->'issue_date') IS DISTINCT FROM 'string'
         OR (v_fields->>'issue_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         OR jsonb_typeof(v_fields->'total_amount') IS DISTINCT FROM 'string'
         OR (v_fields->>'total_amount') !~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$'
         OR (v_fields ? 'due_date' AND jsonb_typeof(v_fields->'due_date')<>'null' AND
             (jsonb_typeof(v_fields->'due_date') IS DISTINCT FROM 'string' OR (v_fields->>'due_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
         OR (v_fields ? 'paid_amount' AND jsonb_typeof(v_fields->'paid_amount')<>'null' AND
             (jsonb_typeof(v_fields->'paid_amount') IS DISTINCT FROM 'string' OR (v_fields->>'paid_amount') !~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$'))
         OR (v_fields ? 'outstanding_amount' AND jsonb_typeof(v_fields->'outstanding_amount')<>'null' AND
             (jsonb_typeof(v_fields->'outstanding_amount') IS DISTINCT FROM 'string' OR (v_fields->>'outstanding_amount') !~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$'))
      THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP financial document fields must use approved statuses, ISO dates and canonical decimal strings';
      END IF;
      BEGIN
        PERFORM (v_fields->>'issue_date')::date;
        IF v_fields ? 'due_date' AND jsonb_typeof(v_fields->'due_date')<>'null' THEN
          PERFORM (v_fields->>'due_date')::date;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP financial document dates must be valid calendar dates';
      END;
    ELSIF p_object_type='customer_payment_receipts' THEN
      IF jsonb_typeof(v_fields->'receipt_number') IS DISTINCT FROM 'string'
         OR length(btrim(v_fields->>'receipt_number')) NOT BETWEEN 1 AND 160
         OR jsonb_typeof(v_fields->'payment_status') IS DISTINCT FROM 'string'
         OR (v_fields->>'payment_status') NOT IN ('confirmed','pending','voided','reversed')
         OR jsonb_typeof(v_fields->'receipt_date') IS DISTINCT FROM 'string'
         OR (v_fields->>'receipt_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         OR jsonb_typeof(v_fields->'amount') IS DISTINCT FROM 'string'
         OR (v_fields->>'amount') !~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$'
      THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP receipt fields must use approved statuses, ISO dates and canonical decimal strings';
      END IF;
      BEGIN
        PERFORM (v_fields->>'receipt_date')::date;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP receipt date must be a valid calendar date';
      END;
    ELSIF p_object_type='customer_statement_entries' THEN
      IF jsonb_typeof(v_fields->'entry_reference') IS DISTINCT FROM 'string'
         OR length(btrim(v_fields->>'entry_reference')) NOT BETWEEN 1 AND 160
         OR jsonb_typeof(v_fields->'entry_type') IS DISTINCT FROM 'string'
         OR (v_fields->>'entry_type') NOT IN ('invoice','payment','credit_note','debit_note','opening_balance','adjustment')
         OR jsonb_typeof(v_fields->'entry_date') IS DISTINCT FROM 'string'
         OR (v_fields->>'entry_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         OR jsonb_typeof(v_fields->'debit_amount') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_fields->'credit_amount') IS DISTINCT FROM 'string'
         OR (v_fields->>'debit_amount') !~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$'
         OR (v_fields->>'credit_amount') !~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$'
         OR (v_fields ? 'due_date' AND jsonb_typeof(v_fields->'due_date')<>'null' AND
             (jsonb_typeof(v_fields->'due_date') IS DISTINCT FROM 'string' OR (v_fields->>'due_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
      THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP statement entry fields must use approved types, ISO dates and canonical decimal strings';
      END IF;
      BEGIN
        PERFORM (v_fields->>'entry_date')::date;
        IF v_fields ? 'due_date' AND jsonb_typeof(v_fields->'due_date')<>'null' THEN
          PERFORM (v_fields->>'due_date')::date;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP statement dates must be valid calendar dates';
      END;
      IF (v_fields->>'debit_amount')::numeric>0 AND (v_fields->>'credit_amount')::numeric>0 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP statement entry cannot contain debit and credit amounts simultaneously';
      END IF;
    END IF;
  END LOOP;

  SELECT c.* INTO v_checkpoint
    FROM public.erp_sync_checkpoints c
   WHERE c.organization_id=p_organization_id AND c.scope_key=p_scope_key
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='ERP checkpoint must be initialized before persisting a page';
  END IF;

  IF v_checkpoint.provider IS DISTINCT FROM p_provider
     OR v_checkpoint.company_external_id IS DISTINCT FROM btrim(p_company_external_id)
     OR v_checkpoint.branch_external_id IS DISTINCT FROM btrim(p_branch_external_id)
     OR v_checkpoint.warehouse_external_id IS DISTINCT FROM nullif(btrim(coalesce(p_warehouse_external_id,'')),'')
     OR v_checkpoint.currency_code IS DISTINCT FROM p_currency_code
     OR v_checkpoint.object_type IS DISTINCT FROM p_object_type
  THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='ERP checkpoint scope hash is already bound to different scope metadata';
  END IF;

  -- An identical page replay must be recognized before CAS/version validation:
  -- a provider may have committed the page while the caller lost the response.
  SELECT r.* INTO v_receipt
    FROM public.erp_sync_page_receipts r
   WHERE r.organization_id=p_organization_id
     AND r.scope_key=p_scope_key
     AND r.page_fingerprint=p_page_fingerprint;
  IF FOUND THEN
    IF v_receipt.response_sha256 IS DISTINCT FROM p_response_sha256
       OR v_receipt.http_status IS DISTINCT FROM p_http_status
       OR v_receipt.records_received IS DISTINCT FROM v_records_received
       OR v_receipt.next_cursor_present IS DISTINCT FROM (p_next_cursor_ciphertext IS NOT NULL)
       OR v_receipt.completed IS DISTINCT FROM p_completed
       OR v_receipt.pending_watermark IS DISTINCT FROM p_pending_watermark
       OR v_receipt.completed_watermark IS DISTINCT FROM p_completed_watermark
    THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='ERP page fingerprint was replayed with different evidence metadata';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'checkpoint',pg_catalog.jsonb_build_object(
        'version',v_checkpoint.version,
        'cursor_ciphertext',v_checkpoint.cursor_ciphertext,
        'pending_watermark',v_checkpoint.pending_watermark,
        'completed_watermark',v_checkpoint.completed_watermark
      ),
      'counts',pg_catalog.jsonb_build_object(
        'created',0,'updated',0,'unchanged',0,'rejected',0,'conflicted',0
      ),
      'duplicate_page',true
    );
  END IF;

  IF v_checkpoint.version<>p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ERP checkpoint version changed; reload before continuing';
  END IF;
  IF (v_checkpoint.completed_watermark IS NOT NULL AND
      (p_completed_watermark IS NULL OR p_completed_watermark<v_checkpoint.completed_watermark))
  THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ERP completed watermark cannot move backwards or be cleared';
  END IF;
  IF p_completed IS FALSE AND p_completed_watermark IS DISTINCT FROM v_checkpoint.completed_watermark THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='incomplete ERP pages must preserve the completed watermark';
  END IF;
  IF p_completed IS FALSE AND v_checkpoint.pending_watermark IS NOT NULL
     AND (p_pending_watermark IS NULL OR p_pending_watermark<v_checkpoint.pending_watermark)
  THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='incomplete ERP pages cannot move the pending watermark backwards';
  END IF;

  FOR v_record IN
    SELECT entry.value FROM pg_catalog.jsonb_array_elements(p_records) AS entry(value)
  LOOP
    v_external_id:=v_record->>'external_id';
    v_idempotency_key:=v_record->>'idempotency_key';
    v_source_updated_at:=(v_record->>'source_updated_at')::timestamptz;
    v_fields:=v_record->'fields';
    v_disposition_reason:=NULL;

    SELECT s.idempotency_key,s.source_updated_at,s.fields
      INTO v_existing_key,v_existing_updated_at,v_existing_fields
      FROM public.erp_sync_staged_records s
     WHERE s.organization_id=p_organization_id
       AND s.scope_key=p_scope_key
       AND s.external_id=v_external_id
     FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.erp_sync_staged_records(
        organization_id,scope_key,provider,object_type,external_id,
        idempotency_key,source_updated_at,fields
      ) VALUES (
        p_organization_id,p_scope_key,p_provider,p_object_type,v_external_id,
        v_idempotency_key,v_source_updated_at,v_fields
      );
      v_created:=v_created+1;
      v_disposition:='created';
    ELSIF v_existing_key=v_idempotency_key THEN
      UPDATE public.erp_sync_staged_records
         SET last_seen_at=statement_timestamp()
       WHERE organization_id=p_organization_id AND scope_key=p_scope_key AND external_id=v_external_id;
      v_unchanged:=v_unchanged+1;
      v_disposition:='unchanged';
    ELSIF v_source_updated_at>v_existing_updated_at THEN
      UPDATE public.erp_sync_staged_records
         SET idempotency_key=v_idempotency_key,
             source_updated_at=v_source_updated_at,
             fields=v_fields,
             last_seen_at=statement_timestamp()
       WHERE organization_id=p_organization_id AND scope_key=p_scope_key AND external_id=v_external_id;
      v_updated:=v_updated+1;
      v_disposition:='updated';
    ELSIF v_source_updated_at<v_existing_updated_at THEN
      v_rejected:=v_rejected+1;
      v_disposition:='rejected';
      v_disposition_reason:='source_timestamp_older';
    ELSIF v_fields=v_existing_fields THEN
      UPDATE public.erp_sync_staged_records
         SET idempotency_key=v_idempotency_key,last_seen_at=statement_timestamp()
       WHERE organization_id=p_organization_id AND scope_key=p_scope_key AND external_id=v_external_id;
      v_unchanged:=v_unchanged+1;
      v_disposition:='unchanged';
    ELSE
      v_conflicted:=v_conflicted+1;
      v_disposition:='conflicted';
      v_disposition_reason:='same_timestamp_payload_mismatch';
    END IF;
    v_outcomes:=v_outcomes || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'external_id',v_external_id,
        'source_updated_at',v_source_updated_at,
        'fields',v_fields,
        'disposition',v_disposition,
        'disposition_reason',v_disposition_reason
      )
    );
  END LOOP;


  UPDATE public.erp_sync_checkpoints
     SET version=version+1,
         cursor_ciphertext=p_next_cursor_ciphertext,
         pending_watermark=p_pending_watermark,
         completed_watermark=p_completed_watermark,
         updated_at=statement_timestamp()
   WHERE organization_id=p_organization_id AND scope_key=p_scope_key
   RETURNING * INTO v_checkpoint;

  INSERT INTO public.erp_sync_page_receipts(
    organization_id,scope_key,page_fingerprint,response_sha256,
    next_cursor_present,http_status,external_request_id,pending_watermark,completed_watermark,records_received,
    created_count,updated_count,unchanged_count,rejected_count,conflicted_count,
    completed,committed_version
  ) VALUES (
    p_organization_id,p_scope_key,p_page_fingerprint,p_response_sha256,
    (p_next_cursor_ciphertext IS NOT NULL),p_http_status,nullif(btrim(coalesce(p_external_request_id,'')),''),p_pending_watermark,p_completed_watermark,
    v_records_received,v_created,v_updated,v_unchanged,v_rejected,v_conflicted,
    p_completed,v_checkpoint.version
  );

  INSERT INTO public.erp_sync_page_record_outcomes(
    organization_id,scope_key,page_fingerprint,external_id,source_updated_at,fields,disposition,disposition_reason
  )
  SELECT p_organization_id,p_scope_key,p_page_fingerprint,
         outcome.external_id,outcome.source_updated_at,outcome.fields,outcome.disposition,outcome.disposition_reason
    FROM pg_catalog.jsonb_to_recordset(v_outcomes) AS outcome(
      external_id text,source_updated_at timestamptz,fields jsonb,disposition text,disposition_reason text
    );

  RETURN pg_catalog.jsonb_build_object(
    'checkpoint',pg_catalog.jsonb_build_object(
      'version',v_checkpoint.version,
      'cursor_ciphertext',v_checkpoint.cursor_ciphertext,
      'pending_watermark',v_checkpoint.pending_watermark,
      'completed_watermark',v_checkpoint.completed_watermark
    ),
    'counts',pg_catalog.jsonb_build_object(
      'created',v_created,'updated',v_updated,'unchanged',v_unchanged,
      'rejected',v_rejected,'conflicted',v_conflicted
    ),
    'duplicate_page',false
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.reset_erp_sync_expired_cursor(
  p_organization_id uuid,
  p_scope_key text,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_checkpoint public.erp_sync_checkpoints%ROWTYPE;
BEGIN
  IF p_organization_id IS NULL OR p_scope_key IS NULL OR p_scope_key !~ '^[0-9a-f]{64}$'
     OR p_expected_version IS NULL OR p_expected_version<0
  THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid ERP checkpoint reset identity is required';
  END IF;

  SELECT c.* INTO v_checkpoint
    FROM public.erp_sync_checkpoints c
   WHERE c.organization_id=p_organization_id AND c.scope_key=p_scope_key
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='ERP checkpoint was not found';
  END IF;
  IF v_checkpoint.version<>p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ERP checkpoint version changed; reload before resetting';
  END IF;

  UPDATE public.erp_sync_checkpoints
     SET version=version+1,cursor_ciphertext=NULL,pending_watermark=NULL,
         updated_at=statement_timestamp()
   WHERE organization_id=p_organization_id AND scope_key=p_scope_key
   RETURNING * INTO v_checkpoint;

  RETURN pg_catalog.jsonb_build_object(
    'version',v_checkpoint.version,
    'cursor_ciphertext',v_checkpoint.cursor_ciphertext,
    'pending_watermark',v_checkpoint.pending_watermark,
    'completed_watermark',v_checkpoint.completed_watermark
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.list_erp_sync_staged_records(
 p_organization_id uuid,p_scope_key text,p_provider text,p_company_external_id text,
 p_branch_external_id text,p_warehouse_external_id text,p_currency_code text,p_object_type text,
 p_limit integer DEFAULT 20,p_offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_checkpoint public.erp_sync_checkpoints%ROWTYPE;
 v_total bigint;
 v_records jsonb;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='service-role ERP staged preview required';
 END IF;
 IF p_organization_id IS NULL OR p_scope_key IS NULL OR p_scope_key !~ '^[0-9a-f]{64}$'
    OR p_provider IS NULL OR p_provider NOT IN ('onyx_pro','al_mutakamel')
    OR p_company_external_id IS NULL OR length(btrim(p_company_external_id)) NOT BETWEEN 1 AND 256
    OR p_branch_external_id IS NULL OR length(btrim(p_branch_external_id)) NOT BETWEEN 1 AND 256
    OR (p_warehouse_external_id IS NOT NULL AND length(btrim(p_warehouse_external_id)) NOT BETWEEN 1 AND 256)
    OR (p_currency_code IS NOT NULL AND p_currency_code !~ '^[A-Z]{3}$')
    OR p_object_type IS NULL OR p_object_type NOT IN (
      'products','customers','warehouses','stock_balances','product_units','product_prices',
      'customer_financial_documents','customer_payment_receipts','customer_statement_entries')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 5000
 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid bounded ERP staged preview scope is required';
 END IF;
 SELECT checkpoint.* INTO v_checkpoint FROM public.erp_sync_checkpoints checkpoint
  WHERE checkpoint.organization_id=p_organization_id AND checkpoint.scope_key=p_scope_key FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='ERP staged preview scope has no checkpoint'; END IF;
 IF v_checkpoint.provider IS DISTINCT FROM p_provider
    OR v_checkpoint.company_external_id IS DISTINCT FROM btrim(p_company_external_id)
    OR v_checkpoint.branch_external_id IS DISTINCT FROM btrim(p_branch_external_id)
    OR v_checkpoint.warehouse_external_id IS DISTINCT FROM nullif(btrim(coalesce(p_warehouse_external_id,'')),'')
    OR v_checkpoint.currency_code IS DISTINCT FROM p_currency_code
    OR v_checkpoint.object_type IS DISTINCT FROM p_object_type
 THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='ERP staged preview scope hash is already bound to different scope metadata'; END IF;
 WITH latest_outcomes AS MATERIALIZED (
   SELECT DISTINCT ON (outcome.external_id)
          outcome.external_id,outcome.source_updated_at,outcome.fields,outcome.disposition,outcome.disposition_reason
     FROM public.erp_sync_page_record_outcomes outcome
    WHERE outcome.organization_id=p_organization_id AND outcome.scope_key=p_scope_key
    ORDER BY outcome.external_id,outcome.recorded_at DESC,outcome.page_fingerprint DESC
 ),
 preview_rows AS MATERIALIZED (
   SELECT staged.external_id,
          coalesce(latest.source_updated_at,staged.source_updated_at) AS source_updated_at,
          coalesce(latest.fields,staged.fields) AS fields,
          latest.disposition,
          latest.disposition_reason
     FROM public.erp_sync_staged_records staged
     LEFT JOIN latest_outcomes latest ON latest.external_id=staged.external_id
    WHERE staged.organization_id=p_organization_id AND staged.scope_key=p_scope_key
   UNION ALL
   SELECT latest.external_id,latest.source_updated_at,latest.fields,latest.disposition,latest.disposition_reason
     FROM latest_outcomes latest
    WHERE latest.disposition IN ('rejected','conflicted')
      AND NOT EXISTS (
        SELECT 1 FROM public.erp_sync_staged_records staged
         WHERE staged.organization_id=p_organization_id
           AND staged.scope_key=p_scope_key
           AND staged.external_id=latest.external_id
      )
 )
 SELECT count(*) INTO v_total FROM preview_rows;

 WITH latest_outcomes AS MATERIALIZED (
   SELECT DISTINCT ON (outcome.external_id)
          outcome.external_id,outcome.source_updated_at,outcome.fields,outcome.disposition,outcome.disposition_reason
     FROM public.erp_sync_page_record_outcomes outcome
    WHERE outcome.organization_id=p_organization_id AND outcome.scope_key=p_scope_key
    ORDER BY outcome.external_id,outcome.recorded_at DESC,outcome.page_fingerprint DESC
 ),
 preview_rows AS MATERIALIZED (
   SELECT staged.external_id,
          coalesce(latest.source_updated_at,staged.source_updated_at) AS source_updated_at,
          coalesce(latest.fields,staged.fields) AS fields,
          latest.disposition,
          latest.disposition_reason
     FROM public.erp_sync_staged_records staged
     LEFT JOIN latest_outcomes latest ON latest.external_id=staged.external_id
    WHERE staged.organization_id=p_organization_id AND staged.scope_key=p_scope_key
   UNION ALL
   SELECT latest.external_id,latest.source_updated_at,latest.fields,latest.disposition,latest.disposition_reason
     FROM latest_outcomes latest
    WHERE latest.disposition IN ('rejected','conflicted')
      AND NOT EXISTS (
        SELECT 1 FROM public.erp_sync_staged_records staged
         WHERE staged.organization_id=p_organization_id
           AND staged.scope_key=p_scope_key
           AND staged.external_id=latest.external_id
      )
 )
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'external_id',page.external_id,
     'source_updated_at',page.source_updated_at,
     'fields',page.fields,
     'last_disposition',page.disposition,
     'last_disposition_reason',page.disposition_reason)
     ORDER BY page.source_updated_at DESC,page.external_id),'[]'::jsonb)
  INTO v_records
  FROM (
    SELECT preview_row.external_id,preview_row.source_updated_at,preview_row.fields,preview_row.disposition
      FROM preview_rows preview_row
     ORDER BY preview_row.source_updated_at DESC,preview_row.external_id
     LIMIT p_limit OFFSET p_offset
  ) page;
 RETURN pg_catalog.jsonb_build_object('records',v_records,'total',v_total,'limit',p_limit,'offset',p_offset,
   'checkpoint_version',v_checkpoint.version,'pending_watermark',v_checkpoint.pending_watermark,
   'completed_watermark',v_checkpoint.completed_watermark);
END
$function$;

REVOKE ALL ON FUNCTION public.load_erp_sync_checkpoint(uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.persist_erp_sync_page_atomically(uuid,text,text,text,text,text,text,text,bigint,text,integer,text,text,jsonb,text,timestamptz,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reset_erp_sync_expired_cursor(uuid,text,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_erp_sync_staged_records(uuid,text,text,text,text,text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.load_erp_sync_checkpoint(uuid,text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_erp_sync_page_atomically(uuid,text,text,text,text,text,text,text,bigint,text,integer,text,text,jsonb,text,timestamptz,timestamptz,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_erp_sync_expired_cursor(uuid,text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_erp_sync_staged_records(uuid,text,text,text,text,text,text,text,integer,integer) TO service_role;

COMMIT;
