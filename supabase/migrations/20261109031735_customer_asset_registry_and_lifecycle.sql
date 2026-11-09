BEGIN;
CREATE TABLE public.customer_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
 product_id uuid NULL REFERENCES public.products(id) ON DELETE RESTRICT,
 source_order_id uuid NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
 source_invoice_id uuid NULL REFERENCES public.customer_invoices(id) ON DELETE RESTRICT,
 asset_name text NOT NULL CHECK(length(btrim(asset_name)) BETWEEN 2 AND 180),
 manufacturer text NULL CHECK(manufacturer IS NULL OR length(btrim(manufacturer))<=120),
 model text NULL CHECK(model IS NULL OR length(btrim(model))<=120),
 serial_number text NULL CHECK(serial_number IS NULL OR length(btrim(serial_number))<=160),
 purchase_date date NULL,
 purchase_evidence_note text NULL CHECK(purchase_evidence_note IS NULL OR length(btrim(purchase_evidence_note))<=500),
 warranty_provider text NULL CHECK(warranty_provider IS NULL OR length(btrim(warranty_provider))<=160),
 warranty_reference text NULL CHECK(warranty_reference IS NULL OR length(btrim(warranty_reference))<=160),
 warranty_evidence_note text NULL CHECK(warranty_evidence_note IS NULL OR length(btrim(warranty_evidence_note))<=500),
 warranty_start_date date NULL,warranty_end_date date NULL,
 coverage_reference text NULL CHECK(coverage_reference IS NULL OR length(btrim(coverage_reference))<=160),
 coverage_start_date date NULL,coverage_end_date date NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','under_maintenance','under_repair','replaced','retired','lost','returned')),
 notes text NULL CHECK(notes IS NULL OR length(btrim(notes))<=2000),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=8000),
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT customer_assets_purchase_evidence_guard CHECK(purchase_date IS NULL OR source_order_id IS NOT NULL OR source_invoice_id IS NOT NULL OR nullif(btrim(purchase_evidence_note),'') IS NOT NULL),
 CONSTRAINT customer_assets_warranty_evidence_guard CHECK(
  (warranty_start_date IS NULL AND warranty_end_date IS NULL AND nullif(btrim(coalesce(warranty_provider,'')),'') IS NULL AND nullif(btrim(coalesce(warranty_reference,'')),'') IS NULL AND nullif(btrim(coalesce(warranty_evidence_note,'')),'') IS NULL)
  OR nullif(btrim(coalesce(warranty_reference,'')),'') IS NOT NULL OR nullif(btrim(coalesce(warranty_evidence_note,'')),'') IS NOT NULL),
 CONSTRAINT customer_assets_warranty_date_order CHECK(warranty_start_date IS NULL OR warranty_end_date IS NULL OR warranty_end_date>=warranty_start_date),
 CONSTRAINT customer_assets_coverage_evidence_guard CHECK((coverage_start_date IS NULL AND coverage_end_date IS NULL) OR nullif(btrim(coalesce(coverage_reference,'')),'') IS NOT NULL),
 CONSTRAINT customer_assets_coverage_date_order CHECK(coverage_start_date IS NULL OR coverage_end_date IS NULL OR coverage_end_date>=coverage_start_date)
);
CREATE UNIQUE INDEX customer_assets_org_serial_unique ON public.customer_assets(organization_id,lower(btrim(serial_number))) WHERE serial_number IS NOT NULL AND btrim(serial_number)<>'';
CREATE INDEX customer_assets_org_customer_updated_idx ON public.customer_assets(organization_id,customer_id,updated_at DESC,id);
CREATE INDEX customer_assets_org_status_updated_idx ON public.customer_assets(organization_id,status,updated_at DESC);

CREATE TABLE public.customer_asset_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 asset_id uuid NOT NULL REFERENCES public.customer_assets(id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK(event_type IN('asset_registered','details_updated','ownership_transferred','maintenance_started','repair_started','repair_completed','warranty_claim','status_changed','replacement','retired','lost','returned','note_added')),
 previous_customer_id uuid NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
 new_customer_id uuid NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
 old_status text NULL CHECK(old_status IS NULL OR old_status IN('active','under_maintenance','under_repair','replaced','retired','lost','returned')),
 new_status text NULL CHECK(new_status IS NULL OR new_status IN('active','under_maintenance','under_repair','replaced','retired','lost','returned')),
 summary text NOT NULL CHECK(length(btrim(summary)) BETWEEN 2 AND 240),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 5 AND 1000),
 reference text NULL CHECK(reference IS NULL OR length(btrim(reference))<=160),
 details text NULL CHECK(details IS NULL OR length(btrim(details))<=2000),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=8000),
 event_at timestamptz NOT NULL DEFAULT now(),
 actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_asset_events_org_asset_time_idx ON public.customer_asset_events(organization_id,asset_id,event_at DESC,id DESC);
CREATE INDEX customer_asset_events_org_customer_time_idx ON public.customer_asset_events(organization_id,new_customer_id,event_at DESC) WHERE new_customer_id IS NOT NULL;
ALTER TABLE public.customer_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_asset_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_customer_asset_can_manage()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.current_profile_id() IS NOT NULL AND public.current_organization_id() IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.organization_id=public.current_organization_id()
  AND p.is_active=true AND r.role IN('admin','manager','customer_manager'));
$function$;
REVOKE ALL ON FUNCTION public.current_customer_asset_can_manage() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_customer_asset_can_manage() TO authenticated;
CREATE POLICY customer_assets_scoped_read ON public.customer_assets FOR SELECT TO authenticated
 USING(organization_id=public.current_organization_id() AND (public.current_customer_asset_can_manage() OR customer_id=public.current_customer_id()));
CREATE POLICY customer_asset_events_scoped_read ON public.customer_asset_events FOR SELECT TO authenticated
 USING(organization_id=public.current_organization_id() AND (public.current_customer_asset_can_manage() OR EXISTS(
  SELECT 1 FROM public.customer_assets a WHERE a.id=customer_asset_events.asset_id
   AND a.organization_id=customer_asset_events.organization_id AND a.customer_id=public.current_customer_id())));
REVOKE ALL ON TABLE public.customer_assets FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.customer_asset_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.customer_assets TO authenticated;
GRANT SELECT ON TABLE public.customer_asset_events TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_customer_asset_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $function$ BEGIN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='customer asset history is append-only'; END; $function$;
REVOKE ALL ON FUNCTION public.prevent_customer_asset_event_mutation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER customer_asset_events_immutable BEFORE UPDATE OR DELETE ON public.customer_asset_events
 FOR EACH ROW EXECUTE FUNCTION public.prevent_customer_asset_event_mutation();

CREATE OR REPLACE FUNCTION public.create_customer_asset(
 p_customer_id uuid,p_asset_name text,p_reason text,p_product_id uuid DEFAULT NULL,
 p_source_order_id uuid DEFAULT NULL,p_source_invoice_id uuid DEFAULT NULL,
 p_manufacturer text DEFAULT NULL,p_model text DEFAULT NULL,p_serial_number text DEFAULT NULL,
 p_purchase_date date DEFAULT NULL,p_purchase_evidence_note text DEFAULT NULL,
 p_warranty_provider text DEFAULT NULL,p_warranty_reference text DEFAULT NULL,p_warranty_evidence_note text DEFAULT NULL,
 p_warranty_start_date date DEFAULT NULL,p_warranty_end_date date DEFAULT NULL,
 p_coverage_reference text DEFAULT NULL,p_coverage_start_date date DEFAULT NULL,p_coverage_end_date date DEFAULT NULL,
 p_notes text DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id();v_org uuid:=public.current_organization_id();v_asset_id uuid;
BEGIN
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.current_customer_asset_can_manage()
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer asset management permission is required';END IF;
 IF p_customer_id IS NULL OR p_asset_name IS NULL OR length(btrim(p_asset_name)) NOT BETWEEN 2 AND 180
 OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000
 OR (p_metadata IS NOT NULL AND(jsonb_typeof(p_metadata)<>'object' OR octet_length(p_metadata::text)>8000))
 OR (p_purchase_date IS NOT NULL AND p_source_order_id IS NULL AND p_source_invoice_id IS NULL AND nullif(btrim(coalesce(p_purchase_evidence_note,'')),'') IS NULL)
 OR ((p_warranty_start_date IS NOT NULL OR p_warranty_end_date IS NOT NULL OR nullif(btrim(coalesce(p_warranty_provider,'')),'') IS NOT NULL OR nullif(btrim(coalesce(p_warranty_reference,'')),'') IS NOT NULL)
    AND nullif(btrim(coalesce(p_warranty_reference,'')),'') IS NULL AND nullif(btrim(coalesce(p_warranty_evidence_note,'')),'') IS NULL)
 OR ((p_coverage_start_date IS NOT NULL OR p_coverage_end_date IS NOT NULL) AND nullif(btrim(coalesce(p_coverage_reference,'')),'') IS NULL)
 OR (p_warranty_start_date IS NOT NULL AND p_warranty_end_date IS NOT NULL AND p_warranty_end_date<p_warranty_start_date)
 OR (p_coverage_start_date IS NOT NULL AND p_coverage_end_date IS NOT NULL AND p_coverage_end_date<p_coverage_start_date)
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='customer asset details or evidence are invalid';END IF;
 PERFORM 1 FROM public.customers c WHERE c.id=p_customer_id AND c.organization_id=v_org FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer is outside the active organization';END IF;
 IF p_product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products p WHERE p.id=p_product_id AND p.organization_id=v_org)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='product is outside the active organization';END IF;
 IF p_source_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=p_source_order_id AND o.organization_id=v_org AND o.customer_id=p_customer_id)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='source order does not belong to this customer and organization';END IF;
 IF p_source_invoice_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customer_invoices i WHERE i.id=p_source_invoice_id AND i.organization_id=v_org AND i.customer_id=p_customer_id AND (p_source_order_id IS NULL OR i.order_id=p_source_order_id))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='source invoice does not belong to this customer, organization and order';END IF;
 INSERT INTO public.customer_assets(organization_id,customer_id,product_id,source_order_id,source_invoice_id,asset_name,manufacturer,model,serial_number,purchase_date,purchase_evidence_note,warranty_provider,warranty_reference,warranty_evidence_note,warranty_start_date,warranty_end_date,coverage_reference,coverage_start_date,coverage_end_date,notes,metadata,created_by,updated_by)
 VALUES(v_org,p_customer_id,p_product_id,p_source_order_id,p_source_invoice_id,btrim(p_asset_name),nullif(btrim(p_manufacturer),''),nullif(btrim(p_model),''),nullif(btrim(p_serial_number),''),p_purchase_date,nullif(btrim(p_purchase_evidence_note),''),nullif(btrim(p_warranty_provider),''),nullif(btrim(p_warranty_reference),''),nullif(btrim(p_warranty_evidence_note),''),p_warranty_start_date,p_warranty_end_date,nullif(btrim(p_coverage_reference),''),p_coverage_start_date,p_coverage_end_date,nullif(btrim(p_notes),''),coalesce(p_metadata,'{}'::jsonb),v_actor,v_actor)
 RETURNING id INTO v_asset_id;
 INSERT INTO public.customer_asset_events(organization_id,asset_id,event_type,new_customer_id,old_status,new_status,summary,reason,details,actor_profile_id)
 VALUES(v_org,v_asset_id,'asset_registered',p_customer_id,NULL,'active','تم تسجيل أصل للعميل',btrim(p_reason),nullif(btrim(p_notes),''),v_actor);
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
 VALUES(v_org,v_actor,'customer_asset.created','customer_asset',v_asset_id,NULL,jsonb_build_object('customer_id',p_customer_id,'product_id',p_product_id,'source_order_id',p_source_order_id,'source_invoice_id',p_source_invoice_id,'status','active'));
 RETURN jsonb_build_object('asset_id',v_asset_id,'status','created');
END;$function$;

CREATE OR REPLACE FUNCTION public.update_customer_asset_details(
 p_asset_id uuid,p_asset_name text,p_reason text,p_manufacturer text DEFAULT NULL,p_model text DEFAULT NULL,p_serial_number text DEFAULT NULL,
 p_purchase_date date DEFAULT NULL,p_purchase_evidence_note text DEFAULT NULL,p_warranty_provider text DEFAULT NULL,p_warranty_reference text DEFAULT NULL,p_warranty_evidence_note text DEFAULT NULL,
 p_warranty_start_date date DEFAULT NULL,p_warranty_end_date date DEFAULT NULL,p_coverage_reference text DEFAULT NULL,p_coverage_start_date date DEFAULT NULL,p_coverage_end_date date DEFAULT NULL,p_notes text DEFAULT NULL,p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id();v_org uuid:=public.current_organization_id();v_asset public.customer_assets%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.current_customer_asset_can_manage()
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer asset management permission is required';END IF;
 IF p_asset_id IS NULL OR p_asset_name IS NULL OR length(btrim(p_asset_name)) NOT BETWEEN 2 AND 180 OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000
 OR (p_metadata IS NOT NULL AND(jsonb_typeof(p_metadata)<>'object' OR octet_length(p_metadata::text)>8000))
 OR (p_purchase_date IS NOT NULL AND nullif(btrim(coalesce(p_purchase_evidence_note,'')),'') IS NULL AND NOT EXISTS(SELECT 1 FROM public.customer_assets a WHERE a.id=p_asset_id AND a.organization_id=v_org AND(a.source_order_id IS NOT NULL OR a.source_invoice_id IS NOT NULL)))
 OR ((p_warranty_start_date IS NOT NULL OR p_warranty_end_date IS NOT NULL OR nullif(btrim(coalesce(p_warranty_provider,'')),'') IS NOT NULL OR nullif(btrim(coalesce(p_warranty_reference,'')),'') IS NOT NULL) AND nullif(btrim(coalesce(p_warranty_reference,'')),'') IS NULL AND nullif(btrim(coalesce(p_warranty_evidence_note,'')),'') IS NULL)
 OR ((p_coverage_start_date IS NOT NULL OR p_coverage_end_date IS NOT NULL) AND nullif(btrim(coalesce(p_coverage_reference,'')),'') IS NULL)
 OR (p_warranty_start_date IS NOT NULL AND p_warranty_end_date IS NOT NULL AND p_warranty_end_date<p_warranty_start_date)
 OR (p_coverage_start_date IS NOT NULL AND p_coverage_end_date IS NOT NULL AND p_coverage_end_date<p_coverage_start_date)
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='customer asset details or evidence are invalid';END IF;
 SELECT a.* INTO v_asset FROM public.customer_assets a WHERE a.id=p_asset_id AND a.organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer asset is unavailable for the active organization';END IF;
 UPDATE public.customer_assets SET asset_name=btrim(p_asset_name),manufacturer=nullif(btrim(p_manufacturer),''),model=nullif(btrim(p_model),''),serial_number=nullif(btrim(p_serial_number),''),purchase_date=p_purchase_date,purchase_evidence_note=nullif(btrim(p_purchase_evidence_note),''),warranty_provider=nullif(btrim(p_warranty_provider),''),warranty_reference=nullif(btrim(p_warranty_reference),''),warranty_evidence_note=nullif(btrim(p_warranty_evidence_note),''),warranty_start_date=p_warranty_start_date,warranty_end_date=p_warranty_end_date,coverage_reference=nullif(btrim(p_coverage_reference),''),coverage_start_date=p_coverage_start_date,coverage_end_date=p_coverage_end_date,notes=nullif(btrim(p_notes),''),metadata=coalesce(p_metadata,'{}'::jsonb),updated_by=v_actor,updated_at=now()
 WHERE id=p_asset_id AND organization_id=v_org;
 INSERT INTO public.customer_asset_events(organization_id,asset_id,event_type,new_customer_id,old_status,new_status,summary,reason,details,metadata,actor_profile_id)
 VALUES(v_org,p_asset_id,'details_updated',v_asset.customer_id,v_asset.status,v_asset.status,'تم تحديث بيانات الأصل',btrim(p_reason),'حُفظت بيانات التغيير في سجل الأحداث.',jsonb_build_object('before',jsonb_build_object('asset_name',v_asset.asset_name,'model',v_asset.model,'serial_number',v_asset.serial_number,'purchase_date',v_asset.purchase_date,'warranty_reference',v_asset.warranty_reference,'warranty_start_date',v_asset.warranty_start_date,'warranty_end_date',v_asset.warranty_end_date),'after',jsonb_build_object('asset_name',btrim(p_asset_name),'model',nullif(btrim(p_model),''),'serial_number',nullif(btrim(p_serial_number),''),'purchase_date',p_purchase_date,'warranty_reference',nullif(btrim(p_warranty_reference),''),'warranty_start_date',p_warranty_start_date,'warranty_end_date',p_warranty_end_date)),v_actor);
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
 VALUES(v_org,v_actor,'customer_asset.details_updated','customer_asset',p_asset_id,jsonb_build_object('asset_name',v_asset.asset_name,'model',v_asset.model,'serial_number',v_asset.serial_number),jsonb_build_object('asset_name',btrim(p_asset_name),'model',nullif(btrim(p_model),''),'serial_number',nullif(btrim(p_serial_number),'')));
 RETURN jsonb_build_object('asset_id',p_asset_id,'status','updated');
END;$function$;

CREATE OR REPLACE FUNCTION public.transfer_customer_asset(p_asset_id uuid,p_new_customer_id uuid,p_reason text,p_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id();v_org uuid:=public.current_organization_id();v_asset public.customer_assets%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.current_customer_asset_can_manage() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer asset ownership management permission is required';END IF;
 IF p_asset_id IS NULL OR p_new_customer_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000 OR(p_reference IS NOT NULL AND length(btrim(p_reference))>160) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='asset transfer details are invalid';END IF;
 SELECT a.* INTO v_asset FROM public.customer_assets a WHERE a.id=p_asset_id AND a.organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer asset is unavailable for the active organization';END IF;
 IF v_asset.customer_id=p_new_customer_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='new owner must differ from current owner';END IF;
 PERFORM 1 FROM public.customers c WHERE c.id=p_new_customer_id AND c.organization_id=v_org FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='new owner is outside the active organization';END IF;
 UPDATE public.customer_assets SET customer_id=p_new_customer_id,updated_by=v_actor,updated_at=now() WHERE id=p_asset_id AND organization_id=v_org;
 INSERT INTO public.customer_asset_events(organization_id,asset_id,event_type,previous_customer_id,new_customer_id,old_status,new_status,summary,reason,reference,actor_profile_id)
 VALUES(v_org,p_asset_id,'ownership_transferred',v_asset.customer_id,p_new_customer_id,v_asset.status,v_asset.status,'تم نقل ملكية الأصل بين عميلين',btrim(p_reason),nullif(btrim(p_reference),''),v_actor);
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
 VALUES(v_org,v_actor,'customer_asset.ownership_transferred','customer_asset',p_asset_id,jsonb_build_object('customer_id',v_asset.customer_id),jsonb_build_object('customer_id',p_new_customer_id,'reference',nullif(btrim(p_reference),'')));
 RETURN jsonb_build_object('asset_id',p_asset_id,'status','transferred','new_customer_id',p_new_customer_id);
END;$function$;

CREATE OR REPLACE FUNCTION public.record_customer_asset_event(p_asset_id uuid,p_event_type text,p_reason text,p_details text DEFAULT NULL,p_reference text DEFAULT NULL,p_new_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id();v_org uuid:=public.current_organization_id();v_asset public.customer_assets%ROWTYPE;v_status text;v_summary text;
BEGIN
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.current_customer_asset_can_manage() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer asset service management permission is required';END IF;
 IF p_asset_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000 OR(p_details IS NOT NULL AND length(btrim(p_details))>2000) OR(p_reference IS NOT NULL AND length(btrim(p_reference))>160) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='customer asset event details are invalid';END IF;
 CASE p_event_type
 WHEN 'maintenance_started' THEN v_status:='under_maintenance';v_summary:='بدء صيانة الأصل';
 WHEN 'repair_started' THEN v_status:='under_repair';v_summary:='بدء إصلاح الأصل';
 WHEN 'repair_completed' THEN v_status:='active';v_summary:='اكتمال إصلاح الأصل';
 WHEN 'warranty_claim' THEN v_status:=NULL;v_summary:='تسجيل مطالبة ضمان';
 WHEN 'replacement' THEN v_status:='replaced';v_summary:='تسجيل استبدال الأصل';
 WHEN 'retired' THEN v_status:='retired';v_summary:='إخراج الأصل من الخدمة';
 WHEN 'lost' THEN v_status:='lost';v_summary:='تسجيل فقد الأصل';
 WHEN 'returned' THEN v_status:='returned';v_summary:='تسجيل إرجاع الأصل';
 WHEN 'note_added' THEN v_status:=NULL;v_summary:='إضافة ملاحظة إلى سجل الأصل';
 WHEN 'status_changed' THEN IF p_new_status NOT IN('active','under_maintenance','under_repair','replaced','retired','lost','returned') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='new asset status is invalid';END IF;v_status:=p_new_status;v_summary:='تغيير حالة الأصل';
 ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported customer asset event type';
 END CASE;
 SELECT a.* INTO v_asset FROM public.customer_assets a WHERE a.id=p_asset_id AND a.organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer asset is unavailable for the active organization';END IF;
 IF v_status IS NOT NULL AND v_status=v_asset.status THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='new asset status must differ from the current status';END IF;
 UPDATE public.customer_assets SET status=coalesce(v_status,status),updated_by=v_actor,updated_at=now() WHERE id=p_asset_id AND organization_id=v_org;
 INSERT INTO public.customer_asset_events(organization_id,asset_id,event_type,new_customer_id,old_status,new_status,summary,reason,reference,details,actor_profile_id)
 VALUES(v_org,p_asset_id,p_event_type,v_asset.customer_id,v_asset.status,coalesce(v_status,v_asset.status),v_summary,btrim(p_reason),nullif(btrim(p_reference),''),nullif(btrim(p_details),''),v_actor);
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
 VALUES(v_org,v_actor,'customer_asset.'||p_event_type,'customer_asset',p_asset_id,jsonb_build_object('status',v_asset.status),jsonb_build_object('status',coalesce(v_status,v_asset.status),'reference',nullif(btrim(p_reference),'')));
 RETURN jsonb_build_object('asset_id',p_asset_id,'status',coalesce(v_status,v_asset.status),'event_type',p_event_type);
END;$function$;

REVOKE ALL ON FUNCTION public.create_customer_asset(uuid,text,text,uuid,uuid,uuid,text,text,text,date,text,text,text,text,date,date,text,date,date,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_customer_asset_details(uuid,text,text,text,text,text,date,text,text,text,text,date,date,text,date,date,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.transfer_customer_asset(uuid,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.record_customer_asset_event(uuid,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_asset(uuid,text,text,uuid,uuid,uuid,text,text,text,date,text,text,text,text,date,date,text,date,date,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_asset_details(uuid,text,text,text,text,text,date,text,text,text,text,date,date,text,date,date,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_customer_asset(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_asset_event(uuid,text,text,text,text,text) TO authenticated;
COMMIT;
