-- AGH-FINANCE-OPERATING-COMMITMENTS-001
-- Source-backed, maker/checker-approved future operating expenses in the 7/30/90-day cash forecast.
-- A payment is not considered settled until its linked cash-expense journal is actually posted.
BEGIN;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES (
  'cash-expense-commitment-evidence',
  'cash-expense-commitment-evidence',
  false,
  10485760,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
ON CONFLICT(id) DO UPDATE SET
  name=EXCLUDED.name,
  public=false,
  file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

ALTER TABLE public.cash_expenses
  ADD CONSTRAINT cash_expenses_organization_id_id_key UNIQUE(organization_id,id);

CREATE TABLE public.cash_expense_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  commitment_number bigint GENERATED ALWAYS AS IDENTITY,
  category text NOT NULL CHECK(char_length(btrim(category)) BETWEEN 2 AND 80),
  description text NOT NULL CHECK(char_length(btrim(description)) BETWEEN 2 AND 600),
  amount numeric(18,2) NOT NULL CHECK(amount>0 AND amount<10000000000000000),
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  payment_method text NOT NULL CHECK(payment_method IN ('cash','transfer','card','other')),
  reference text CHECK(reference IS NULL OR char_length(reference)<=200),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending_approval'
    CHECK(status IN ('pending_approval','approved','cancelled','payment_recorded','settled')),
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK(payload_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  approval_reason text,
  cancelled_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  cancelled_at timestamptz,
  cancellation_reason text,
  payment_cash_expense_id uuid,
  payment_recorded_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payment_recorded_at timestamptz,
  settled_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,commitment_number),
  UNIQUE(organization_id,id),
  UNIQUE(organization_id,idempotency_key),
  FOREIGN KEY(organization_id,payment_cash_expense_id)
    REFERENCES public.cash_expenses(organization_id,id) ON DELETE RESTRICT,
  CHECK (
    (status='pending_approval'
      AND approved_by_profile_id IS NULL AND approved_at IS NULL AND approval_reason IS NULL
      AND cancelled_by_profile_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL
      AND payment_cash_expense_id IS NULL AND payment_recorded_by_profile_id IS NULL AND payment_recorded_at IS NULL
      AND settled_by_profile_id IS NULL AND settled_at IS NULL)
    OR
    (status='approved'
      AND approved_by_profile_id IS NOT NULL AND approved_at IS NOT NULL
      AND char_length(btrim(coalesce(approval_reason,''))) BETWEEN 3 AND 500
      AND cancelled_by_profile_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL
      AND payment_cash_expense_id IS NULL AND payment_recorded_by_profile_id IS NULL AND payment_recorded_at IS NULL
      AND settled_by_profile_id IS NULL AND settled_at IS NULL)
    OR
    (status='cancelled'
      AND cancelled_by_profile_id IS NOT NULL AND cancelled_at IS NOT NULL
      AND char_length(btrim(coalesce(cancellation_reason,''))) BETWEEN 5 AND 500
      AND payment_cash_expense_id IS NULL AND payment_recorded_by_profile_id IS NULL AND payment_recorded_at IS NULL
      AND settled_by_profile_id IS NULL AND settled_at IS NULL)
    OR
    (status='payment_recorded'
      AND approved_by_profile_id IS NOT NULL AND approved_at IS NOT NULL
      AND payment_cash_expense_id IS NOT NULL AND payment_recorded_by_profile_id IS NOT NULL AND payment_recorded_at IS NOT NULL
      AND settled_by_profile_id IS NULL AND settled_at IS NULL)
    OR
    (status='settled'
      AND approved_by_profile_id IS NOT NULL AND approved_at IS NOT NULL
      AND payment_cash_expense_id IS NOT NULL AND payment_recorded_by_profile_id IS NOT NULL AND payment_recorded_at IS NOT NULL
      AND settled_by_profile_id IS NOT NULL AND settled_at IS NOT NULL)
  ),
  CHECK(approved_by_profile_id IS NULL OR approved_by_profile_id<>created_by_profile_id),
  CHECK(payment_recorded_by_profile_id IS NULL OR payment_recorded_by_profile_id<>approved_by_profile_id)
);
CREATE INDEX cash_expense_commitments_org_due_idx
  ON public.cash_expense_commitments(organization_id,due_date,status,created_at);
CREATE UNIQUE INDEX cash_expense_commitments_payment_expense_uidx
  ON public.cash_expense_commitments(organization_id,payment_cash_expense_id)
  WHERE payment_cash_expense_id IS NOT NULL;

CREATE TABLE public.cash_expense_commitment_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  commitment_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK(
    char_length(btrim(file_name)) BETWEEN 1 AND 180
    AND file_name !~ '[[:cntrl:]/]'
    AND position(chr(92) in file_name)=0
  ),
  mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,id),
  FOREIGN KEY(organization_id,commitment_id)
    REFERENCES public.cash_expense_commitments(organization_id,id) ON DELETE RESTRICT,
  CHECK(storage_path ~ (
    '^'||commitment_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$'
  ))
);
CREATE INDEX cash_expense_commitment_evidence_commitment_idx
  ON public.cash_expense_commitment_evidence(organization_id,commitment_id,created_at,id);

CREATE TABLE public.cash_expense_commitment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  commitment_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN (
    'CREATED','EVIDENCE_ATTACHED','APPROVED','CANCELLED','PAYMENT_RECORDED','SETTLED'
  )),
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  payload_fingerprint text NOT NULL CHECK(payload_fingerprint ~ '^[0-9a-f]{32}$'),
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,commitment_id)
    REFERENCES public.cash_expense_commitments(organization_id,id) ON DELETE RESTRICT,
  UNIQUE(organization_id,id),
  UNIQUE(organization_id,idempotency_key)
);
CREATE INDEX cash_expense_commitment_events_commitment_idx
  ON public.cash_expense_commitment_events(organization_id,commitment_id,created_at,id);

ALTER TABLE public.cash_expense_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_expense_commitment_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_expense_commitment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY cash_expense_commitments_finance_read
  ON public.cash_expense_commitments FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(
      SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    )
  );
CREATE POLICY cash_expense_commitment_evidence_finance_read
  ON public.cash_expense_commitment_evidence FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(
      SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    )
  );
CREATE POLICY cash_expense_commitment_events_finance_read
  ON public.cash_expense_commitment_events FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id=(
      SELECT p.organization_id FROM public.profiles p
      WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    )
  );
GRANT SELECT ON public.cash_expense_commitments,public.cash_expense_commitment_evidence,public.cash_expense_commitment_events TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.cash_expense_commitments,public.cash_expense_commitment_evidence,public.cash_expense_commitment_events
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_cash_expense_commitment_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='cash expense commitment evidence and event history are append-only';
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_cash_expense_commitment_append_only() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cash_expense_commitment_evidence_immutable
  BEFORE UPDATE OR DELETE ON public.cash_expense_commitment_evidence
  FOR EACH ROW EXECUTE FUNCTION public.guard_cash_expense_commitment_append_only();
CREATE TRIGGER cash_expense_commitment_events_immutable
  BEFORE UPDATE OR DELETE ON public.cash_expense_commitment_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_cash_expense_commitment_append_only();

-- Object path: <commitment UUID>/<random UUID>.<pdf|jpg|png|webp>.
DROP POLICY IF EXISTS cash_expense_commitment_evidence_finance_read ON storage.objects;
CREATE POLICY cash_expense_commitment_evidence_finance_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id='cash-expense-commitment-evidence'
    AND public.can_manage_finance()
    AND EXISTS(
      SELECT 1 FROM public.cash_expense_commitments c
      JOIN public.profiles p ON p.organization_id=c.organization_id
      WHERE c.id::text=(storage.foldername(name))[1]
        AND p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    )
  );
DROP POLICY IF EXISTS cash_expense_commitment_evidence_finance_upload ON storage.objects;
CREATE POLICY cash_expense_commitment_evidence_finance_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='cash-expense-commitment-evidence'
    AND public.can_manage_finance()
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$'
    AND EXISTS(
      SELECT 1 FROM public.cash_expense_commitments c
      JOIN public.profiles p ON p.organization_id=c.organization_id
      WHERE c.id::text=(storage.foldername(name))[1]
        AND c.status='pending_approval'
        AND c.created_by_profile_id=p.id
        AND p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    )
  );
DROP POLICY IF EXISTS cash_expense_commitment_evidence_orphan_cleanup ON storage.objects;
CREATE POLICY cash_expense_commitment_evidence_orphan_cleanup
  ON storage.objects FOR DELETE TO authenticated
  USING(
    bucket_id='cash-expense-commitment-evidence'
    AND public.can_manage_finance()
    AND EXISTS(
      SELECT 1 FROM public.cash_expense_commitments c
      JOIN public.profiles p ON p.organization_id=c.organization_id
      WHERE c.id::text=(storage.foldername(name))[1] AND c.status='pending_approval'
        AND c.created_by_profile_id=p.id
        AND p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.cash_expense_commitment_evidence e WHERE e.storage_path=name
    )
  );

CREATE OR REPLACE FUNCTION public.record_cash_expense_commitment(
  p_idempotency_key uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_currency text,
  p_payment_method text,
  p_reference text,
  p_due_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_category text:=pg_catalog.btrim(coalesce(p_category,''));
  v_description text:=pg_catalog.btrim(coalesce(p_description,''));
  v_currency text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_currency,'')));
  v_method text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_payment_method,'')));
  v_reference text:=nullif(pg_catalog.btrim(coalesce(p_reference,'')),'');
  v_fingerprint text;
  v_row public.cash_expense_commitments%ROWTYPE;
  v_payload jsonb;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to create an operating expense commitment';
  END IF;
  IF p_idempotency_key IS NULL OR p_due_date IS NULL
     OR pg_catalog.char_length(v_category) NOT BETWEEN 2 AND 80
     OR pg_catalog.char_length(v_description) NOT BETWEEN 2 AND 600
     OR (v_reference IS NOT NULL AND pg_catalog.char_length(v_reference)>200)
     OR p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity')
     OR p_amount<=0 OR p_amount>=10000000000000000 OR p_amount<>pg_catalog.round(p_amount,2)
     OR v_currency !~ '^[A-Z]{3}$'
     OR v_method NOT IN ('cash','transfer','card','other') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid operating expense commitment payload or exact-cent amount';
  END IF;
  v_payload:=pg_catalog.jsonb_build_object(
    'category',v_category,'description',v_description,'amount',p_amount::text,'currency',v_currency,
    'payment_method',v_method,'reference',v_reference,'due_date',p_due_date::text
  );
  v_fingerprint:=pg_catalog.md5(v_payload::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':cash-expense-commitment:'||p_idempotency_key::text,0));
  SELECT c.* INTO v_row FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_org AND c.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_row.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='cash expense commitment idempotency payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,
      'status',v_row.status,'replayed',true);
  END IF;
  INSERT INTO public.cash_expense_commitments(
    organization_id,category,description,amount,currency,payment_method,reference,due_date,
    idempotency_key,payload_fingerprint,created_by_profile_id
  ) VALUES(
    v_org,v_category,v_description,p_amount,v_currency,v_method,v_reference,p_due_date,
    p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING * INTO v_row;
  INSERT INTO public.cash_expense_commitment_events(
    organization_id,commitment_id,event_type,actor_profile_id,idempotency_key,payload_fingerprint,event_payload
  ) VALUES(
    v_org,v_row.id,'CREATED',v_actor,p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('status','pending_approval','due_date',p_due_date::text,'amount',p_amount::text,'currency',v_currency)
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_expense_commitment.created','cash_expense_commitment',v_row.id,NULL,
    pg_catalog.jsonb_build_object('status',v_row.status,'amount',v_row.amount::text,'currency',v_currency,'due_date',p_due_date::text));
  RETURN pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,'status',v_row.status,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_cash_expense_commitment(uuid,text,text,numeric,text,text,text,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.record_cash_expense_commitment(uuid,text,text,numeric,text,text,text,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_cash_expense_commitment_evidence(
  p_commitment_id uuid,p_storage_path text,p_file_name text,p_mime_type text,
  p_byte_size bigint,p_content_sha256 text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_commitment public.cash_expense_commitments%ROWTYPE;
  v_object_metadata jsonb;
  v_existing public.cash_expense_commitment_evidence%ROWTYPE;
  v_row public.cash_expense_commitment_evidence%ROWTYPE;
  v_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to attach operating expense evidence';
  END IF;
  SELECT c.* INTO v_commitment FROM public.cash_expense_commitments c
   WHERE c.id=p_commitment_id AND c.organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR v_commitment.status<>'pending_approval'
     OR v_commitment.created_by_profile_id<>v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only the commitment creator may attach evidence while it awaits approval';
  END IF;
  IF p_file_name IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_file_name)) NOT BETWEEN 1 AND 180
     OR p_file_name ~ '[[:cntrl:]/]' OR pg_catalog.strpos(p_file_name,chr(92))>0
     OR p_mime_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
     OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 10485760
     OR p_content_sha256 IS NULL OR p_content_sha256 !~ '^[0-9a-f]{64}$'
     OR p_storage_path IS NULL OR p_storage_path !~ (
       '^'||p_commitment_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='operating expense evidence metadata or path is invalid';
  END IF;
  IF (p_mime_type='application/pdf' AND p_storage_path !~ '[.]pdf$')
     OR (p_mime_type='image/jpeg' AND p_storage_path !~ '[.]jpg$')
     OR (p_mime_type='image/png' AND p_storage_path !~ '[.]png$')
     OR (p_mime_type='image/webp' AND p_storage_path !~ '[.]webp$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='evidence extension does not match MIME type';
  END IF;
  SELECT o.metadata INTO v_object_metadata FROM storage.objects o
   WHERE o.bucket_id='cash-expense-commitment-evidence' AND o.name=p_storage_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='uploaded operating expense evidence object was not found';
  END IF;
  IF coalesce(v_object_metadata->>'size','') !~ '^[0-9]+$'
     OR (v_object_metadata->>'size')::bigint IS DISTINCT FROM p_byte_size
     OR (v_object_metadata->>'size')::bigint NOT BETWEEN 1 AND 10485760
     OR v_object_metadata->>'mimetype' IS DISTINCT FROM p_mime_type THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='uploaded evidence size or MIME metadata does not match the registered object';
  END IF;
  SELECT e.* INTO v_existing FROM public.cash_expense_commitment_evidence e
   WHERE e.organization_id=v_org AND e.storage_path=p_storage_path;
  IF FOUND THEN
    IF v_existing.commitment_id<>p_commitment_id OR v_existing.file_name<>p_file_name
       OR v_existing.mime_type<>p_mime_type OR v_existing.byte_size<>p_byte_size
       OR v_existing.content_sha256<>p_content_sha256 THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='evidence object is already registered with another payload';
    END IF;
    RETURN pg_catalog.jsonb_build_object('id',v_existing.id,'storage_path',v_existing.storage_path,'replayed',true);
  END IF;
  SELECT count(*)::integer INTO v_count FROM public.cash_expense_commitment_evidence e
   WHERE e.organization_id=v_org AND e.commitment_id=p_commitment_id;
  IF v_count>=10 THEN RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='at most ten supporting files may be attached'; END IF;
  INSERT INTO public.cash_expense_commitment_evidence(
    organization_id,commitment_id,storage_path,file_name,mime_type,byte_size,content_sha256,uploaded_by_profile_id
  ) VALUES(v_org,p_commitment_id,p_storage_path,p_file_name,p_mime_type,p_byte_size,p_content_sha256,v_actor)
  RETURNING * INTO v_row;
  INSERT INTO public.cash_expense_commitment_events(
    organization_id,commitment_id,event_type,actor_profile_id,idempotency_key,payload_fingerprint,event_payload
  ) VALUES(
    v_org,p_commitment_id,'EVIDENCE_ATTACHED',v_actor,gen_random_uuid(),
    pg_catalog.md5(pg_catalog.jsonb_build_object('evidence_id',v_row.id,'sha256',v_row.content_sha256)::text),
    pg_catalog.jsonb_build_object('evidence_id',v_row.id,'file_name',v_row.file_name,'mime_type',v_row.mime_type,'byte_size',v_row.byte_size)
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_expense_commitment.evidence_attached','cash_expense_commitment',p_commitment_id,NULL,
    pg_catalog.jsonb_build_object('evidence_id',v_row.id,'mime_type',v_row.mime_type,'byte_size',v_row.byte_size,'content_sha256',v_row.content_sha256));
  RETURN pg_catalog.jsonb_build_object('id',v_row.id,'storage_path',v_row.storage_path,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_cash_expense_commitment_evidence(uuid,text,text,text,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.record_cash_expense_commitment_evidence(uuid,text,text,text,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_cash_expense_commitment(
  p_commitment_id uuid,p_reason text,p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_role text;
  v_reason text:=pg_catalog.btrim(coalesce(p_reason,''));
  v_fingerprint text;
  v_row public.cash_expense_commitments%ROWTYPE;
  v_event public.cash_expense_commitment_events%ROWTYPE;
BEGIN
  SELECT p.organization_id,r.role INTO v_org,v_role
  FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true
    AND r.role IN ('admin','manager')
  ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='an active finance administrator or manager is required to approve an expense commitment';
  END IF;
  IF p_commitment_id IS NULL OR p_idempotency_key IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='commitment, approval reason and idempotency key are required';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object('action','APPROVE','commitment_id',p_commitment_id,'reason',v_reason)::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':cash-expense-commitment-event:'||p_idempotency_key::text,0));
  SELECT e.* INTO v_event FROM public.cash_expense_commitment_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_event.event_type<>'APPROVED' OR v_event.payload_fingerprint<>v_fingerprint OR v_event.actor_profile_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='expense commitment approval idempotency payload conflict';
    END IF;
    RETURN v_event.event_payload||pg_catalog.jsonb_build_object('replayed',true);
  END IF;
  SELECT c.* INTO v_row FROM public.cash_expense_commitments c
   WHERE c.id=p_commitment_id AND c.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='expense commitment not found in this organization'; END IF;
  IF v_row.created_by_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='commitment creator cannot approve their own request';
  END IF;
  IF v_row.status<>'pending_approval' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only a pending expense commitment can be approved';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence e WHERE e.organization_id=v_org AND e.commitment_id=v_row.id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='an uploaded and registered source document is required before approval';
  END IF;
  UPDATE public.cash_expense_commitments
     SET status='approved',approved_by_profile_id=v_actor,approved_at=statement_timestamp(),
         approval_reason=v_reason,updated_at=statement_timestamp()
   WHERE organization_id=v_org AND id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.cash_expense_commitment_events(
    organization_id,commitment_id,event_type,actor_profile_id,idempotency_key,payload_fingerprint,event_payload
  ) VALUES(
    v_org,v_row.id,'APPROVED',v_actor,p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,'status',v_row.status,'approved_at',v_row.approved_at,'replayed',false)
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_expense_commitment.approved','cash_expense_commitment',v_row.id,
    pg_catalog.jsonb_build_object('status','pending_approval'),
    pg_catalog.jsonb_build_object('status','approved','reason',v_reason,'evidence_count',(SELECT count(*) FROM public.cash_expense_commitment_evidence e WHERE e.commitment_id=v_row.id)));
  RETURN pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,'status',v_row.status,'approved_at',v_row.approved_at,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.approve_cash_expense_commitment(uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.approve_cash_expense_commitment(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_cash_expense_commitment(
  p_commitment_id uuid,p_reason text,p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_role text;
  v_reason text:=pg_catalog.btrim(coalesce(p_reason,''));
  v_fingerprint text;
  v_row public.cash_expense_commitments%ROWTYPE;
  v_event public.cash_expense_commitment_events%ROWTYPE;
BEGIN
  SELECT p.organization_id,r.role INTO v_org,v_role
  FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true
    AND r.role IN ('admin','manager')
  ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='an active finance administrator or manager is required to cancel an expense commitment';
  END IF;
  IF p_commitment_id IS NULL OR p_idempotency_key IS NULL OR pg_catalog.char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='commitment, cancellation reason and idempotency key are required';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object('action','CANCEL','commitment_id',p_commitment_id,'reason',v_reason)::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':cash-expense-commitment-event:'||p_idempotency_key::text,0));
  SELECT e.* INTO v_event FROM public.cash_expense_commitment_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_event.event_type<>'CANCELLED' OR v_event.payload_fingerprint<>v_fingerprint OR v_event.actor_profile_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='expense commitment cancellation idempotency payload conflict';
    END IF;
    RETURN v_event.event_payload||pg_catalog.jsonb_build_object('replayed',true);
  END IF;
  SELECT c.* INTO v_row FROM public.cash_expense_commitments c
   WHERE c.id=p_commitment_id AND c.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='expense commitment not found in this organization'; END IF;
  IF v_row.status NOT IN ('pending_approval','approved') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='payment-recorded or settled commitments require reconciliation and cannot be cancelled';
  END IF;
  UPDATE public.cash_expense_commitments
     SET status='cancelled',cancelled_by_profile_id=v_actor,cancelled_at=statement_timestamp(),
         cancellation_reason=v_reason,updated_at=statement_timestamp()
   WHERE organization_id=v_org AND id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.cash_expense_commitment_events(
    organization_id,commitment_id,event_type,actor_profile_id,idempotency_key,payload_fingerprint,event_payload
  ) VALUES(
    v_org,v_row.id,'CANCELLED',v_actor,p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,'status',v_row.status,'replayed',false)
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_expense_commitment.cancelled','cash_expense_commitment',v_row.id,
    pg_catalog.jsonb_build_object('status','pending_or_approved'),
    pg_catalog.jsonb_build_object('status','cancelled','reason',v_reason));
  RETURN pg_catalog.jsonb_build_object('id',v_row.id,'commitment_number',v_row.commitment_number::text,'status',v_row.status,'replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.cancel_cash_expense_commitment(uuid,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_cash_expense_commitment(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_cash_expense_commitment_payment(
  p_commitment_id uuid,p_payment_date date,p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_fingerprint text;
  v_row public.cash_expense_commitments%ROWTYPE;
  v_event public.cash_expense_commitment_events%ROWTYPE;
  v_expense_result jsonb;
  v_expense_id uuid;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to record an operating commitment payment';
  END IF;
  IF p_commitment_id IS NULL OR p_payment_date IS NULL OR p_payment_date>current_date OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='commitment, non-future payment date and idempotency key are required';
  END IF;
  v_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'action','PAYMENT_RECORDED','commitment_id',p_commitment_id,'payment_date',p_payment_date::text
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':cash-expense-commitment-event:'||p_idempotency_key::text,0));
  SELECT e.* INTO v_event FROM public.cash_expense_commitment_events e
   WHERE e.organization_id=v_org AND e.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_event.event_type<>'PAYMENT_RECORDED' OR v_event.payload_fingerprint<>v_fingerprint OR v_event.actor_profile_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='expense commitment payment idempotency payload conflict';
    END IF;
    RETURN v_event.event_payload||pg_catalog.jsonb_build_object('replayed',true);
  END IF;
  SELECT c.* INTO v_row FROM public.cash_expense_commitments c
   WHERE c.id=p_commitment_id AND c.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='expense commitment not found in this organization'; END IF;
  IF v_row.status<>'approved' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only an approved operating expense commitment can record payment';
  END IF;
  IF v_row.approved_by_profile_id=v_actor OR v_row.created_by_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='payment recording must be performed by a person independent from commitment creation and approval';
  END IF;
  IF v_row.currency<>'YER' THEN
    RAISE EXCEPTION USING ERRCODE='0A000',MESSAGE='foreign-currency settlement is unavailable until an approved exact-rate FX accounting policy exists';
  END IF;
  v_expense_result:=public.record_cash_expense(
    p_idempotency_key,v_row.category,v_row.description,v_row.amount,v_row.currency,
    v_row.payment_method,v_row.reference,p_payment_date
  );
  v_expense_id:=nullif(v_expense_result->>'expense_id','')::uuid;
  IF v_expense_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='cash expense source could not be resolved; retry the same idempotency key'; END IF;
  UPDATE public.cash_expense_commitments
     SET status='payment_recorded',payment_cash_expense_id=v_expense_id,
         payment_recorded_by_profile_id=v_actor,payment_recorded_at=statement_timestamp(),
         updated_at=statement_timestamp()
   WHERE organization_id=v_org AND id=v_row.id RETURNING * INTO v_row;
  INSERT INTO public.cash_expense_commitment_events(
    organization_id,commitment_id,event_type,actor_profile_id,idempotency_key,payload_fingerprint,event_payload
  ) VALUES(
    v_org,v_row.id,'PAYMENT_RECORDED',v_actor,p_idempotency_key,v_fingerprint,
    pg_catalog.jsonb_build_object('id',v_row.id,'status',v_row.status,'cash_expense_id',v_expense_id,
      'expense_number',v_expense_result->>'expense_number','payment_date',p_payment_date::text,'replayed',false)
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'finance.cash_expense_commitment.payment_recorded','cash_expense_commitment',v_row.id,
    pg_catalog.jsonb_build_object('status','approved'),
    pg_catalog.jsonb_build_object('status','payment_recorded','cash_expense_id',v_expense_id,
      'expense_number',v_expense_result->>'expense_number','payment_date',p_payment_date::text));
  RETURN pg_catalog.jsonb_build_object('id',v_row.id,'status',v_row.status,'cash_expense_id',v_expense_id,
    'expense_number',v_expense_result->>'expense_number','replayed',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.record_cash_expense_commitment_payment(uuid,date,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.record_cash_expense_commitment_payment(uuid,date,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_cash_expense_commitments(p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_limit integer:=coalesce(p_limit,50);
  v_offset integer:=coalesce(p_offset,0);
  v_items jsonb;
  v_count integer;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read operating expense commitments';
  END IF;
  IF v_limit NOT BETWEEN 1 AND 100 OR v_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid operating expense commitment page bounds';
  END IF;
  SELECT count(*)::integer INTO v_count FROM public.cash_expense_commitments c WHERE c.organization_id=v_org;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',q.id,'commitment_number',q.commitment_number::text,'category',q.category,'description',q.description,
    'amount',q.amount::text,'currency',q.currency,'payment_method',q.payment_method,'reference',q.reference,
    'due_date',q.due_date::text,'status',q.status,'created_by_profile_id',q.created_by_profile_id,
    'approved_by_profile_id',q.approved_by_profile_id,'approved_at',q.approved_at,'approval_reason',q.approval_reason,
    'cancelled_by_profile_id',q.cancelled_by_profile_id,'cancellation_reason',q.cancellation_reason,
    'payment_cash_expense_id',q.payment_cash_expense_id,'payment_recorded_at',q.payment_recorded_at,
    'settled_at',q.settled_at,'journal_entry_id',q.journal_entry_id,'journal_status',q.journal_status,
    'evidence_count',q.evidence_count
  ) ORDER BY q.due_date,q.created_at,q.id),'[]'::jsonb)
  INTO v_items
  FROM(
    SELECT c.*,
      (SELECT count(*)::integer FROM public.cash_expense_commitment_evidence e
       WHERE e.organization_id=c.organization_id AND e.commitment_id=c.id) AS evidence_count,
      j.journal_entry_id,j.journal_status
    FROM public.cash_expense_commitments c
    LEFT JOIN LATERAL (
      SELECT sp.journal_entry_id,je.status AS journal_status
      FROM public.accounting_source_postings sp
      JOIN public.accounting_journal_entries je ON je.organization_id=sp.organization_id AND je.id=sp.journal_entry_id
      WHERE sp.organization_id=c.organization_id AND sp.source_type='cash_expense'
        AND sp.source_id=c.payment_cash_expense_id AND sp.posting_kind='original'
      ORDER BY sp.created_at DESC,sp.id DESC LIMIT 1
    ) j ON true
    WHERE c.organization_id=v_org
    ORDER BY c.due_date,c.created_at,c.id LIMIT v_limit OFFSET v_offset
  ) q;
  RETURN pg_catalog.jsonb_build_object('items',v_items,'total_count',v_count,'has_more',(v_offset+pg_catalog.jsonb_array_length(v_items))<v_count,'limit',v_limit,'offset',v_offset);
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_cash_expense_commitments(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_cash_expense_commitments(integer,integer) TO authenticated;

-- Only a fully posted original cash-expense journal settles a recorded payment.
-- Until then the forward schedule is PARTIAL and its projected balance must be withheld.
CREATE OR REPLACE FUNCTION public.sync_cash_expense_commitment_after_journal_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_source_id uuid;
  v_link public.accounting_source_postings%ROWTYPE;
  v_commitment public.cash_expense_commitments%ROWTYPE;
  v_expense public.cash_expenses%ROWTYPE;
  v_actor uuid:=NEW.posted_by_profile_id;
  v_snapshot jsonb;
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' OR NEW.status IS DISTINCT FROM 'posted'
     OR NEW.source_type IS DISTINCT FROM 'cash_expense' THEN RETURN NEW; END IF;
  SELECT sp.* INTO v_link FROM public.accounting_source_postings sp
   WHERE sp.organization_id=NEW.organization_id AND sp.journal_entry_id=NEW.id
     AND sp.source_type='cash_expense' AND sp.posting_kind='original' FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT c.* INTO v_commitment FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_link.organization_id AND c.payment_cash_expense_id=v_link.source_id
     AND c.status='payment_recorded' FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT e.* INTO v_expense FROM public.cash_expenses e
   WHERE e.organization_id=v_link.organization_id AND e.id=v_link.source_id;
  IF v_expense.id IS NULL OR v_expense.status IS DISTINCT FROM 'posted'
     OR v_expense.amount IS DISTINCT FROM v_commitment.amount
     OR v_expense.currency IS DISTINCT FROM v_commitment.currency
     OR v_link.source_amount IS DISTINCT FROM v_commitment.amount
     OR v_link.source_currency IS DISTINCT FROM v_commitment.currency
     OR NEW.source_reference IS DISTINCT FROM v_expense.id::text
     OR NEW.entry_date IS DISTINCT FROM v_expense.expense_date THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='posted cash-expense journal does not exactly reconcile to the approved commitment';
  END IF;
  IF v_actor IS NULL OR v_actor=v_commitment.payment_recorded_by_profile_id
     OR v_actor=NEW.created_by_profile_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='settlement requires a journal poster independent from the payment recorder and journal creator';
  END IF;
  UPDATE public.cash_expense_commitments
     SET status='settled',settled_by_profile_id=v_actor,settled_at=statement_timestamp(),
         updated_at=statement_timestamp()
   WHERE organization_id=v_link.organization_id AND id=v_commitment.id
   RETURNING pg_catalog.jsonb_build_object('id',id,'status',status,'cash_expense_id',payment_cash_expense_id,
      'journal_entry_id',NEW.id,'settled_at',settled_at) INTO v_snapshot;
  INSERT INTO public.cash_expense_commitment_events(
    organization_id,commitment_id,event_type,actor_profile_id,idempotency_key,payload_fingerprint,event_payload
  ) VALUES(
    v_link.organization_id,v_commitment.id,'SETTLED',v_actor,gen_random_uuid(),
    pg_catalog.md5(pg_catalog.jsonb_build_object('journal_entry_id',NEW.id,'cash_expense_id',v_link.source_id)::text),v_snapshot
  );
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_link.organization_id,v_actor,'finance.cash_expense_commitment.settled','cash_expense_commitment',v_commitment.id,
    pg_catalog.jsonb_build_object('status','payment_recorded','cash_expense_id',v_link.source_id),
    v_snapshot||pg_catalog.jsonb_build_object('status','settled'));
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.sync_cash_expense_commitment_after_journal_post() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS cash_expense_commitment_settlement_after_journal_post ON public.accounting_journal_entries;
CREATE TRIGGER cash_expense_commitment_settlement_after_journal_post
AFTER UPDATE OF status ON public.accounting_journal_entries
FOR EACH ROW WHEN(OLD.status='draft' AND NEW.status='posted' AND NEW.source_type='cash_expense')
EXECUTE FUNCTION public.sync_cash_expense_commitment_after_journal_post();

CREATE OR REPLACE FUNCTION public.fetch_cash_expense_commitment_cashflow_schedule(
  p_from date,p_to date,p_as_of timestamptz,p_currency text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_role text;
  v_currency text:=nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_currency,''))),'');
  v_today date;
  v_now timestamptz:=statement_timestamp();
  v_pending integer:=0;
  v_overdue integer:=0;
  v_payment_pending integer:=0;
  v_missing_evidence integer:=0;
  v_changed_after_asof integer:=0;
  v_entries jsonb:='[]'::jsonb;
  v_evidence jsonb:='[]'::jsonb;
  v_period jsonb;
BEGIN
  SELECT p.organization_id,r.role INTO v_org,v_role
  FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true
    AND r.role IN ('admin','manager')
  ORDER BY CASE r.role WHEN 'admin' THEN 0 ELSE 1 END LIMIT 1;
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance administrator or manager permission required for operating expense cashflow';
  END IF;
  v_today:=(p_as_of AT TIME ZONE 'UTC')::date;
  IF p_from IS NULL OR p_to IS NULL OR p_as_of IS NULL OR p_from>p_to
     OR p_from<v_today OR p_to>v_today+90
     OR p_as_of<v_now-interval '5 minutes' OR p_as_of>v_now+interval '1 minute'
     OR (v_currency IS NOT NULL AND v_currency !~ '^[A-Z]{3}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='operating expense cashflow period, currency or as-of snapshot is invalid';
  END IF;
  v_period:=pg_catalog.jsonb_build_object('from',p_from::text,'to',p_to::text);

  SELECT count(*)::integer INTO v_pending FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_org AND c.status='pending_approval' AND c.due_date<=p_to AND c.created_at<=p_as_of
     AND (v_currency IS NULL OR c.currency=v_currency);
  SELECT count(*)::integer INTO v_overdue FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_org AND c.status='approved' AND c.due_date<p_from AND c.created_at<=p_as_of
     AND (v_currency IS NULL OR c.currency=v_currency);
  SELECT count(*)::integer INTO v_payment_pending FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_org AND c.status='payment_recorded' AND c.due_date<=p_to AND c.created_at<=p_as_of
     AND (v_currency IS NULL OR c.currency=v_currency);
  SELECT count(*)::integer INTO v_missing_evidence FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_org AND c.status='approved' AND c.due_date BETWEEN p_from AND p_to
     AND c.created_at<=p_as_of AND (v_currency IS NULL OR c.currency=v_currency)
     AND NOT EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence e
       WHERE e.organization_id=c.organization_id AND e.commitment_id=c.id AND e.created_at<=p_as_of);

  SELECT count(*)::integer INTO v_changed_after_asof
    FROM public.cash_expense_commitments c
   WHERE c.organization_id=v_org AND c.due_date<=p_to
     AND (v_currency IS NULL OR c.currency=v_currency)
     AND (c.created_at>p_as_of OR c.updated_at>p_as_of);

  WITH approved AS (
    SELECT c.* FROM public.cash_expense_commitments c
    WHERE c.organization_id=v_org AND c.status='approved' AND c.due_date BETWEEN p_from AND p_to
      AND (v_currency IS NULL OR c.currency=v_currency)
      AND c.created_at<=p_as_of
      AND EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence e
        WHERE e.organization_id=c.organization_id AND e.commitment_id=c.id AND e.created_at<=p_as_of)
  ), positions AS (
    SELECT a.id,a.commitment_number,a.category,a.currency,a.due_date,a.created_at,a.amount,
      (SELECT array_agg(e.id::text ORDER BY e.id)
       FROM public.cash_expense_commitment_evidence e
       WHERE e.organization_id=a.organization_id AND e.commitment_id=a.id) AS evidence_ids
    FROM approved a
  )
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id','cash-expense-commitment-outflow:'||p.id::text,
    'direction','OUTFLOW','dueDate',p.due_date::text,
    'amount',pg_catalog.jsonb_build_object(
      'id','metric:cash-expense-commitment:'||p.id::text,
      'key','cashflow.operating_expense_commitment',
      'value',p.amount::text,'unit','CURRENCY','currency',p.currency,
      'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','asOf',p_as_of,
      'lineage',pg_catalog.jsonb_build_object(
        'evidenceIds',pg_catalog.to_jsonb(ARRAY['cash-expense-commitment:'||p.id::text]||
          ARRAY(SELECT 'cash-expense-commitment-evidence:'||u.evidence_id FROM pg_catalog.unnest(p.evidence_ids) AS u(evidence_id))),
        'formulaId','nasr1.approved-operating-expense-commitment','formulaVersion','1'
      )
    )
  ) ORDER BY p.due_date,p.id),'[]'::jsonb)
  INTO v_entries FROM positions p;

  WITH approved AS (
    SELECT c.* FROM public.cash_expense_commitments c
    WHERE c.organization_id=v_org AND c.status='approved' AND c.due_date BETWEEN p_from AND p_to
      AND (v_currency IS NULL OR c.currency=v_currency)
      AND c.created_at<=p_as_of
      AND EXISTS(SELECT 1 FROM public.cash_expense_commitment_evidence e
        WHERE e.organization_id=c.organization_id AND e.commitment_id=c.id AND e.created_at<=p_as_of)
  ), commitment_records AS (
    SELECT
      'cash-expense-commitment:'||c.id::text AS id,
      pg_catalog.jsonb_build_object(
        'id','cash-expense-commitment:'||c.id::text,
        'source',pg_catalog.jsonb_build_object('kind','TABLE','name','cash_expense_commitments','recordId',c.id::text),
        'sourceTimestamp',c.created_at,'asOf',p_as_of,'period',v_period,'currency',c.currency,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
      ) AS payload
    FROM approved c
    UNION ALL
    SELECT
      'cash-expense-commitment-evidence:'||e.id::text,
      pg_catalog.jsonb_build_object(
        'id','cash-expense-commitment-evidence:'||e.id::text,
        'source',pg_catalog.jsonb_build_object('kind','TABLE','name','cash_expense_commitment_evidence','recordId',e.id::text),
        'sourceTimestamp',e.created_at,'asOf',p_as_of,'period',v_period,'currency',c.currency,
        'status','VERIFIED','completeness','COMPLETE','quality','ACCEPTABLE','warnings','[]'::jsonb
      )
    FROM approved c JOIN public.cash_expense_commitment_evidence e
      ON e.organization_id=c.organization_id AND e.commitment_id=c.id
  )
  SELECT coalesce(pg_catalog.jsonb_agg(payload ORDER BY id),'[]'::jsonb)
    INTO v_evidence FROM commitment_records;

  RETURN pg_catalog.jsonb_build_object(
    'status',CASE WHEN v_pending=0 AND v_overdue=0 AND v_payment_pending=0 AND v_missing_evidence=0 AND v_changed_after_asof=0 THEN 'OK' ELSE 'PARTIAL' END,
    'completeness',CASE WHEN v_pending=0 AND v_overdue=0 AND v_payment_pending=0 AND v_missing_evidence=0 AND v_changed_after_asof=0 THEN 'COMPLETE' ELSE 'PARTIAL' END,
    'quality',CASE WHEN v_pending=0 AND v_overdue=0 AND v_payment_pending=0 AND v_missing_evidence=0 AND v_changed_after_asof=0 THEN 'ACCEPTABLE' ELSE 'WARNINGS' END,
    'asOf',p_as_of,'period',v_period,'currency',v_currency,'sideEffects','NONE',
    'entries',v_entries,'evidenceRecords',v_evidence,
    'pendingApprovalCount',v_pending,'overdueApprovedCount',v_overdue,
    'paymentAwaitingJournalCount',v_payment_pending,'missingEvidenceCount',v_missing_evidence,
    'changedAfterAsOfCount',v_changed_after_asof,
    'warnings',CASE
      WHEN v_pending>0 AND v_overdue>0 AND v_payment_pending>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: commitments await approval, overdue approved commitments exist, and recorded payments await posted journals.'
      )
      WHEN v_pending>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: one or more due commitments await independent approval and are not included as verified outflows.'
      )
      WHEN v_overdue>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: overdue approved commitments fall before the forecast window and are not assigned fabricated future dates.'
      )
      WHEN v_payment_pending>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: cash-expense payment sources exist but their original accounting journals are not yet posted; projected cash remains withheld.'
      )
      WHEN v_missing_evidence>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: an approved commitment has no registered source evidence.'
      )
      WHEN v_changed_after_asof>0 THEN pg_catalog.jsonb_build_array(
        'Operating expense coverage is partial: one or more commitment records changed after this snapshot timestamp; refresh the schedule before relying on its totals.'
      )
      ELSE '[]'::jsonb
    END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_cash_expense_commitment_cashflow_schedule(date,date,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_cash_expense_commitment_cashflow_schedule(date,date,timestamptz,text) TO authenticated;

COMMENT ON TABLE public.cash_expense_commitments IS
  'Source-document-backed upcoming operating expenses. Maker/checker approval is required before inclusion in cashflow; actual payment remains unresolved until its cash-expense journal is posted.';
COMMENT ON FUNCTION public.fetch_cash_expense_commitment_cashflow_schedule(date,date,timestamptz,text) IS
  'Tenant-scoped, exact-cent forward outflows from independently approved, source-attached operating expense commitments. Pending approval, overdue and payment-awaiting-journal states force PARTIAL completeness.';

COMMIT;
