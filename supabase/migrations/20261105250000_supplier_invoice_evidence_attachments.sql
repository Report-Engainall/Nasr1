-- Private, organization-scoped supplier invoice evidence.
-- Objects are immutable after registration; only unregistered upload orphans may be removed.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'supplier-invoice-evidence',
  'supplier-invoice-evidence',
  false,
  10485760,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.purchase_supplier_invoice_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (
    char_length(btrim(file_name)) BETWEEN 1 AND 180
    AND file_name !~ '[[:cntrl:]/]'
    AND position(chr(92) in file_name) = 0
  ),
  mime_type text NOT NULL CHECK (mime_type IN (
    'application/pdf','image/jpeg','image/png','image/webp'
  )),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,invoice_id)
    REFERENCES public.purchase_supplier_invoices(organization_id,id) ON DELETE RESTRICT,
  CHECK (storage_path ~ (
    '^' || invoice_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$'
  ))
);
CREATE INDEX purchase_supplier_invoice_evidence_invoice_idx
  ON public.purchase_supplier_invoice_evidence(organization_id,invoice_id,created_at,id);

ALTER TABLE public.purchase_supplier_invoice_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_supplier_invoice_evidence_finance_read
  ON public.purchase_supplier_invoice_evidence FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
      WHERE p.id = public.current_profile_id()
        AND p.auth_user_id = auth.uid()
        AND p.is_active = true
    )
  );
GRANT SELECT ON public.purchase_supplier_invoice_evidence TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.purchase_supplier_invoice_evidence FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_purchase_supplier_invoice_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='supplier invoice evidence is append-only';
END;
$function$;
CREATE TRIGGER purchase_supplier_invoice_evidence_immutable
  BEFORE UPDATE OR DELETE ON public.purchase_supplier_invoice_evidence
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_supplier_invoice_evidence();

-- Path layout is <invoice UUID>/<random UUID>.<extension>.
-- The invoice UUID is resolved against the caller's active organization on each storage operation.
DROP POLICY IF EXISTS supplier_invoice_evidence_finance_read ON storage.objects;
CREATE POLICY supplier_invoice_evidence_finance_read
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'supplier-invoice-evidence'
    AND public.can_manage_finance()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_supplier_invoices i
      JOIN public.profiles p ON p.organization_id = i.organization_id
      WHERE i.id::text = (storage.foldername(name))[1]
        AND p.id = public.current_profile_id()
        AND p.auth_user_id = auth.uid()
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS supplier_invoice_evidence_finance_upload ON storage.objects;
CREATE POLICY supplier_invoice_evidence_finance_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'supplier-invoice-evidence'
    AND public.can_manage_finance()
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$'
    AND EXISTS (
      SELECT 1
      FROM public.purchase_supplier_invoices i
      JOIN public.profiles p ON p.organization_id = i.organization_id
      WHERE i.id::text = (storage.foldername(name))[1]
        AND p.id = public.current_profile_id()
        AND p.auth_user_id = auth.uid()
        AND p.is_active = true
    )
  );

-- Best-effort client cleanup can delete only a path that has not been registered as evidence.
DROP POLICY IF EXISTS supplier_invoice_evidence_orphan_cleanup ON storage.objects;
CREATE POLICY supplier_invoice_evidence_orphan_cleanup
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'supplier-invoice-evidence'
    AND public.can_manage_finance()
    AND EXISTS (
      SELECT 1
      FROM public.purchase_supplier_invoices i
      JOIN public.profiles p ON p.organization_id = i.organization_id
      WHERE i.id::text = (storage.foldername(name))[1]
        AND p.id = public.current_profile_id()
        AND p.auth_user_id = auth.uid()
        AND p.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.purchase_supplier_invoice_evidence e
      WHERE e.storage_path = name
    )
  );

CREATE OR REPLACE FUNCTION public.record_purchase_supplier_invoice_evidence(
  p_invoice_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_content_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_object_metadata jsonb;
  v_object_size bigint;
  v_existing public.purchase_supplier_invoice_evidence%ROWTYPE;
  v_row public.purchase_supplier_invoice_evidence%ROWTYPE;
  v_count integer;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active = true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to attach supplier invoice evidence';
  END IF;
  IF p_invoice_id IS NULL
     OR p_file_name IS NULL OR char_length(btrim(p_file_name)) NOT BETWEEN 1 AND 180
     OR p_file_name ~ '[[:cntrl:]/]' OR position(chr(92) in p_file_name) > 0
     OR p_mime_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
     OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 10485760
     OR p_content_sha256 IS NULL OR p_content_sha256 !~ '^[0-9a-f]{64}$'
     OR p_storage_path IS NULL
     OR p_storage_path !~ ('^' || p_invoice_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](pdf|jpg|png|webp)$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice evidence metadata or storage path is invalid';
  END IF;
  IF (p_mime_type='application/pdf' AND p_storage_path !~ '[.]pdf$')
     OR (p_mime_type='image/jpeg' AND p_storage_path !~ '[.]jpg$')
     OR (p_mime_type='image/png' AND p_storage_path !~ '[.]png$')
     OR (p_mime_type='image/webp' AND p_storage_path !~ '[.]webp$') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier invoice evidence extension does not match its MIME type';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('supplier-invoice-evidence:' || p_invoice_id::text));
  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_supplier_invoices i
    WHERE i.id = p_invoice_id AND i.organization_id = v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier invoice is not available in this organization';
  END IF;

  SELECT o.metadata INTO v_object_metadata
  FROM storage.objects o
  WHERE o.bucket_id='supplier-invoice-evidence' AND o.name=p_storage_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='uploaded supplier invoice evidence object was not found';
  END IF;
  IF coalesce(v_object_metadata->>'size','') !~ '^\d+$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='uploaded supplier invoice evidence size metadata is invalid';
  END IF;
  v_object_size := (v_object_metadata->>'size')::bigint;
  IF v_object_size <> p_byte_size OR v_object_size NOT BETWEEN 1 AND 10485760 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='uploaded supplier invoice evidence size does not match its object';
  END IF;
  IF coalesce(v_object_metadata->>'mimetype',p_mime_type) <> p_mime_type THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='uploaded supplier invoice evidence MIME type does not match its object';
  END IF;

  SELECT e.* INTO v_existing
  FROM public.purchase_supplier_invoice_evidence e
  WHERE e.storage_path=p_storage_path;
  IF FOUND THEN
    IF v_existing.organization_id=v_org AND v_existing.invoice_id=p_invoice_id
       AND v_existing.file_name=btrim(p_file_name) AND v_existing.mime_type=p_mime_type
       AND v_existing.byte_size=p_byte_size AND v_existing.content_sha256=p_content_sha256 THEN
      RETURN jsonb_build_object(
        'id',v_existing.id,'invoice_id',v_existing.invoice_id,'storage_path',v_existing.storage_path,
        'file_name',v_existing.file_name,'mime_type',v_existing.mime_type,'byte_size',v_existing.byte_size,
        'content_sha256',v_existing.content_sha256,'uploaded_by_profile_id',v_existing.uploaded_by_profile_id,
        'created_at',v_existing.created_at,'replayed',true
      );
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='supplier invoice evidence path is already registered';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.purchase_supplier_invoice_evidence e
  WHERE e.organization_id=v_org AND e.invoice_id=p_invoice_id;
  IF v_count >= 25 THEN
    RAISE EXCEPTION USING ERRCODE='54000',MESSAGE='supplier invoice evidence attachment limit reached';
  END IF;

  INSERT INTO public.purchase_supplier_invoice_evidence (
    organization_id,invoice_id,storage_path,file_name,mime_type,byte_size,
    content_sha256,uploaded_by_profile_id
  ) VALUES (
    v_org,p_invoice_id,p_storage_path,btrim(p_file_name),p_mime_type,p_byte_size,
    p_content_sha256,v_actor
  ) RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',v_row.id,'invoice_id',v_row.invoice_id,'storage_path',v_row.storage_path,
    'file_name',v_row.file_name,'mime_type',v_row.mime_type,'byte_size',v_row.byte_size,
    'content_sha256',v_row.content_sha256,'uploaded_by_profile_id',v_row.uploaded_by_profile_id,
    'created_at',v_row.created_at,'replayed',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.record_purchase_supplier_invoice_evidence(uuid,text,text,text,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_purchase_supplier_invoice_evidence(uuid,text,text,text,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_purchase_supplier_invoice_evidence(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_items jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read supplier invoice evidence';
  END IF;
  IF p_invoice_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.purchase_supplier_invoices i
    WHERE i.id=p_invoice_id AND i.organization_id=v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='supplier invoice is not available in this organization';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'invoice_id',e.invoice_id,'storage_path',e.storage_path,'file_name',e.file_name,
    'mime_type',e.mime_type,'byte_size',e.byte_size,'content_sha256',e.content_sha256,
    'uploaded_by_profile_id',e.uploaded_by_profile_id,'created_at',e.created_at
  ) ORDER BY e.created_at DESC,e.id),'[]'::jsonb)
  INTO v_items
  FROM public.purchase_supplier_invoice_evidence e
  WHERE e.organization_id=v_org AND e.invoice_id=p_invoice_id;

  RETURN v_items;
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_purchase_supplier_invoice_evidence(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_supplier_invoice_evidence(uuid) TO authenticated;
