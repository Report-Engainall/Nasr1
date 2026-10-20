-- Tenant-native audited product/category commands; inventory quantities remain in stock workflows.
CREATE OR REPLACE FUNCTION public.create_admin_catalog_category(p_name text,p_parent_id uuid DEFAULT NULL,p_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a uuid:=public.current_profile_id(); o uuid:=public.current_organization_id(); n text:=btrim(coalesce(p_name,'')); c text:=nullif(btrim(coalesce(p_code,'')),''); i uuid;
BEGIN
 IF auth.uid() IS NULL OR a IS NULL OR o IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=a AND r.role IN('admin','manager'))
 OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=a AND p.auth_user_id=auth.uid() AND p.organization_id=o AND p.is_active)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active admin or manager profile required for catalog commands'; END IF;
 IF length(n)<1 OR length(n)>100 OR (c IS NOT NULL AND length(c)>64) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='category name/code length is invalid'; END IF;
 IF p_parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categories x WHERE x.id=p_parent_id AND x.organization_id=o AND x.is_active)
 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='active parent category not found in organization'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(o::text||':cat:'||coalesce(p_parent_id::text,'root')||':'||lower(n),0));
 SELECT x.id INTO i FROM public.categories x WHERE x.organization_id=o AND x.parent_id IS NOT DISTINCT FROM p_parent_id AND lower(btrim(x.name))=lower(n) AND x.is_active ORDER BY x.id LIMIT 1 FOR UPDATE;
 IF i IS NOT NULL THEN RETURN jsonb_build_object('id',i,'name',n,'created',false); END IF;
 INSERT INTO public.categories(organization_id,parent_id,name,code,is_active) VALUES(o,p_parent_id,n,c,true) RETURNING id INTO i;
 INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,old_value,new_value)
 VALUES(o,a,'catalog.category_created','category',i,'{}'::jsonb,jsonb_build_object('name',n,'parent_id',p_parent_id,'code',c));
 RETURN jsonb_build_object('id',i,'name',n,'created',true);
END $$;

CREATE OR REPLACE FUNCTION public.save_admin_catalog_product(p_product_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 a uuid:=public.current_profile_id(); o uuid:=public.current_organization_id();
 n text; code text; bar text; u text; descr text; st text; cat uuid;
 b numeric; ww numeric; wh numeric; rt numeric; old public.products%ROWTYPE;
 created boolean:=p_product_id IS NULL; i uuid; before_json jsonb; after_json jsonb;
BEGIN
 IF auth.uid() IS NULL OR a IS NULL OR o IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=a AND r.role IN('admin','manager'))
 OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=a AND p.auth_user_id=auth.uid() AND p.organization_id=o AND p.is_active)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active admin or manager profile required for catalog commands'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
 OR (p_payload-ARRAY['name','item_code','barcode','unit','description','category_id','base_price','price_wholesale_of_wholesale','price_wholesale','price_retail','status','expected_base_price','expected_price_wholesale_of_wholesale','expected_price_wholesale','expected_price_retail']::text[])<>'{}'::jsonb
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='catalog payload contains unsupported fields'; END IF;
 IF jsonb_typeof(p_payload->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'item_code') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_payload->'unit') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'base_price') IS DISTINCT FROM 'number'
 OR jsonb_typeof(p_payload->'price_wholesale_of_wholesale') IS DISTINCT FROM 'number' OR jsonb_typeof(p_payload->'price_wholesale') IS DISTINCT FROM 'number'
 OR jsonb_typeof(p_payload->'price_retail') IS DISTINCT FROM 'number' OR jsonb_typeof(p_payload->'status') IS DISTINCT FROM 'string'
 OR NOT(p_payload?'barcode') OR NOT(p_payload?'description') OR NOT(p_payload?'category_id')
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='catalog payload is missing required fields or has invalid types'; END IF;
 n:=btrim(p_payload->>'name'); code:=upper(btrim(p_payload->>'item_code')); bar:=nullif(btrim(coalesce(p_payload->>'barcode','')),'');
 u:=btrim(p_payload->>'unit'); descr:=nullif(btrim(coalesce(p_payload->>'description','')),''); st:=p_payload->>'status';
 BEGIN
  b:=(p_payload->>'base_price')::numeric; ww:=(p_payload->>'price_wholesale_of_wholesale')::numeric;
  wh:=(p_payload->>'price_wholesale')::numeric; rt:=(p_payload->>'price_retail')::numeric;
  IF p_payload->>'category_id' IS NOT NULL THEN cat:=(p_payload->>'category_id')::uuid; END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='catalog category or price is malformed'; END;
 IF length(n)<1 OR length(n)>200 OR length(code)<1 OR length(code)>100 OR length(u)<1 OR length(u)>40
 OR (bar IS NOT NULL AND length(bar)>100) OR (descr IS NOT NULL AND length(descr)>2000) OR st NOT IN('active','inactive')
 OR b IS NULL OR ww IS NULL OR wh IS NULL OR rt IS NULL OR b::text IN('NaN','Infinity','-Infinity') OR ww::text IN('NaN','Infinity','-Infinity')
 OR wh::text IN('NaN','Infinity','-Infinity') OR rt::text IN('NaN','Infinity','-Infinity')
 OR b<0 OR ww<0 OR wh<0 OR rt<0 OR b>999999999999 OR ww>999999999999 OR wh>999999999999 OR rt>999999999999
 OR b<>round(b,2) OR ww<>round(ww,2) OR wh<>round(wh,2) OR rt<>round(rt,2)
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='catalog fields or prices are invalid'; END IF;
 IF cat IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categories x WHERE x.id=cat AND x.organization_id=o AND x.is_active)
 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='active category not found in organization'; END IF;
 IF NOT created THEN
  IF jsonb_typeof(p_payload->'expected_base_price') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_payload->'expected_price_wholesale_of_wholesale') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_payload->'expected_price_wholesale') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_payload->'expected_price_retail') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='product edit requires expected price values'; END IF;
  SELECT p.* INTO old FROM public.products p WHERE p.id=p_product_id AND p.organization_id=o FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='product not found in organization'; END IF;
  IF old.base_price IS DISTINCT FROM (p_payload->>'expected_base_price')::numeric
  OR old.price_wholesale_of_wholesale IS DISTINCT FROM (p_payload->>'expected_price_wholesale_of_wholesale')::numeric
  OR old.price_wholesale IS DISTINCT FROM (p_payload->>'expected_price_wholesale')::numeric
  OR old.price_retail IS DISTINCT FROM (p_payload->>'expected_price_retail')::numeric
  THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='product prices changed after the form opened; reload before saving'; END IF;
  before_json:=jsonb_build_object('name',old.name,'item_code',old.item_code,'barcode',old.barcode,'unit',old.unit,'description',old.description,'category_id',old.category_id,
   'base_price',old.base_price,'price_wholesale_of_wholesale',old.price_wholesale_of_wholesale,'price_wholesale',old.price_wholesale,'price_retail',old.price_retail,'status',old.status);
  UPDATE public.products SET name=n,item_code=code,barcode=bar,unit=u,description=descr,category_id=cat,base_price=b,
   price_wholesale_of_wholesale=ww,price_wholesale=wh,price_retail=rt,status=st,updated_at=pg_catalog.now()
   WHERE id=p_product_id AND organization_id=o;
  i:=p_product_id;
 ELSE
  INSERT INTO public.products(organization_id,category_id,name,item_code,barcode,description,unit,base_price,price_wholesale_of_wholesale,price_wholesale,price_retail,status)
  VALUES(o,cat,n,code,bar,descr,u,b,ww,wh,rt,st) RETURNING id INTO i;
  before_json:='{}'::jsonb;
 END IF;
 after_json:=jsonb_build_object('name',n,'item_code',code,'barcode',bar,'unit',u,'description',descr,'category_id',cat,
  'base_price',b,'price_wholesale_of_wholesale',ww,'price_wholesale',wh,'price_retail',rt,'status',st);
 INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,old_value,new_value)
 VALUES(o,a,CASE WHEN created THEN 'catalog.product_created' ELSE 'catalog.product_updated' END,'product',i,before_json,after_json);
 RETURN jsonb_build_object('id',i,'status',st,'created',created);
END $$;

CREATE OR REPLACE FUNCTION public.archive_admin_catalog_product(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a uuid:=public.current_profile_id(); o uuid:=public.current_organization_id(); old public.products%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR a IS NULL OR o IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=a AND r.role IN('admin','manager'))
 OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=a AND p.auth_user_id=auth.uid() AND p.organization_id=o AND p.is_active)
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active admin or manager profile required for catalog commands'; END IF;
 SELECT p.* INTO old FROM public.products p WHERE p.id=p_product_id AND p.organization_id=o FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='product not found in organization'; END IF;
 IF old.status<>'inactive' THEN
  UPDATE public.products SET status='inactive',updated_at=pg_catalog.now() WHERE id=p_product_id AND organization_id=o;
  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,old_value,new_value)
  VALUES(o,a,'catalog.product_archived','product',p_product_id,jsonb_build_object('status',old.status),jsonb_build_object('status','inactive'));
 END IF;
 RETURN jsonb_build_object('id',p_product_id,'status','inactive','archived',true);
END $$;
REVOKE ALL ON FUNCTION public.create_admin_catalog_category(text,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_admin_catalog_product(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.archive_admin_catalog_product(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_admin_catalog_category(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_catalog_product(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_admin_catalog_product(uuid) TO authenticated;
