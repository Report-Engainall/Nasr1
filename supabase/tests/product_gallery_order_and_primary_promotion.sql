\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE public.profiles(
  id uuid PRIMARY KEY,auth_user_id uuid NOT NULL,organization_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles(profile_id uuid NOT NULL,role text NOT NULL,PRIMARY KEY(profile_id,role));
CREATE TABLE public.products(
  id uuid PRIMARY KEY,organization_id uuid NOT NULL,name text NOT NULL,image_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.product_media(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL,url text NOT NULL,
  alt_text text,sort_order integer NOT NULL DEFAULT 0,is_primary boolean NOT NULL DEFAULT false
);
CREATE TABLE public.audit_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,actor_id uuid NOT NULL,
  action text NOT NULL,entity_type text NOT NULL,entity_id uuid NOT NULL,
  old_value jsonb,new_value jsonb,created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$function$;

INSERT INTO public.profiles(id,auth_user_id,organization_id,is_active) VALUES
 ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222223','33333333-3333-4333-8333-333333333334','11111111-1111-4111-8111-111111111111',true),
 ('22222222-2222-4222-8222-222222222224','33333333-3333-4333-8333-333333333334','12121212-1212-4121-8121-121212121212',true);
INSERT INTO public.user_roles(profile_id,role) VALUES
 ('22222222-2222-4222-8222-222222222222','admin'),
 ('22222222-2222-4222-8222-222222222223','customer'),
 ('22222222-2222-4222-8222-222222222224','admin');

INSERT INTO public.products(id,organization_id,name,image_url) VALUES (
 '44444444-4444-4444-8444-444444444444',
 '11111111-1111-4111-8111-111111111111',
 'Aghbari test product',
 'https://storage.example.test/storage/v1/object/public/product-images/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/primary.webp'
);

INSERT INTO public.product_media(product_id,url,sort_order,is_primary) VALUES
 ('44444444-4444-4444-8444-444444444444',
  'https://storage.example.test/storage/v1/object/public/product-images/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/gallery-1.webp',0,false),
 ('44444444-4444-4444-8444-444444444444',
  'https://storage.example.test/storage/v1/object/public/product-images/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/gallery-2.webp',1,false);

\ir ../migrations/20261116115000_product_gallery_order_and_primary_promotion.sql

SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);

DO $gallery_acceptance$
DECLARE
  v_product uuid:='44444444-4444-4444-8444-444444444444';
  v_old_primary text:='https://storage.example.test/storage/v1/object/public/product-images/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/primary.webp';
  v_first text:='https://storage.example.test/storage/v1/object/public/product-images/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/gallery-1.webp';
  v_second text:='https://storage.example.test/storage/v1/object/public/product-images/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/gallery-2.webp';
  v_result jsonb;
  v_count integer;
  v_error boolean:=false;
  v_expected_sort text[];
BEGIN
  v_result:=public.reorder_staff_product_gallery_images(v_product,ARRAY[v_second,v_first]);
  IF v_result->>'changed'<>'true'
     OR v_result->'image_gallery_urls'<>pg_catalog.to_jsonb(ARRAY[v_second,v_first]) THEN
    RAISE EXCEPTION 'gallery reorder failed: %',v_result;
  END IF;
  SELECT pg_catalog.array_agg(url ORDER BY sort_order) INTO v_expected_sort
    FROM public.product_media WHERE product_id=v_product AND is_primary=false;
  IF v_expected_sort<>ARRAY[v_second,v_first] THEN
    RAISE EXCEPTION 'gallery persisted order is wrong: %',v_expected_sort;
  END IF;

  v_result:=public.set_staff_product_primary_from_gallery(v_product,v_second,v_old_primary);
  IF v_result->>'changed'<>'true' OR v_result->>'image_url' IS DISTINCT FROM v_second
     OR v_result->>'previous_image_url' IS DISTINCT FROM v_old_primary THEN
    RAISE EXCEPTION 'gallery-to-primary promotion failed: %',v_result;
  END IF;
  IF (SELECT image_url FROM public.products WHERE id=v_product) IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'product primary URL was not updated';
  END IF;

  SELECT pg_catalog.array_agg(url ORDER BY sort_order) INTO v_expected_sort
    FROM public.product_media WHERE product_id=v_product AND is_primary=false;
  IF v_expected_sort<>ARRAY[v_first,v_old_primary] THEN
    RAISE EXCEPTION 'previous primary image was not preserved at the end of the gallery: %',v_expected_sort;
  END IF;
  IF EXISTS(SELECT 1 FROM public.product_media WHERE product_id=v_product AND url=v_second) THEN
    RAISE EXCEPTION 'promoted image remained duplicated in the gallery';
  END IF;
  SELECT count(*) INTO v_count FROM public.product_media
   WHERE product_id=v_product AND is_primary=false;
  IF v_count<>2 THEN RAISE EXCEPTION 'gallery image count changed unexpectedly: %',v_count; END IF;

  BEGIN
    PERFORM public.set_staff_product_primary_from_gallery(v_product,v_second,v_old_primary);
  EXCEPTION WHEN SQLSTATE 'PT409' THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'stale primary image compare value was not rejected'; END IF;

  v_error:=false;
  BEGIN
    PERFORM public.reorder_staff_product_gallery_images(v_product,ARRAY[v_first,v_first]);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'duplicate gallery order entries were not rejected'; END IF;

  v_error:=false;
  BEGIN
    PERFORM public.reorder_staff_product_gallery_images(v_product,ARRAY[
      'https://storage.example.test/storage/v1/object/public/product-images/12121212-1212-4121-8121-121212121212/44444444-4444-4444-8444-444444444444/foreign.webp',
      v_old_primary
    ]);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error:=true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'foreign tenant image URL was not rejected'; END IF;

  IF (SELECT count(*) FROM public.audit_logs WHERE entity_id=v_product
      AND action IN ('catalog.product_gallery_reordered','catalog.product_primary_promoted_from_gallery'))<>2 THEN
    RAISE EXCEPTION 'gallery order/promotion audit records missing';
  END IF;
END;
$gallery_acceptance$;

SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333334',false);
DO $staff_denial$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.reorder_staff_product_gallery_images(
      '44444444-4444-4444-8444-444444444444',ARRAY[]::text[]
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'non-staff user could reorder product gallery'; END IF;
END;
$staff_denial$;

SELECT pg_catalog.set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333334',false);
DO $tenant_denial$
DECLARE denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.set_staff_product_primary_from_gallery(
      '44444444-4444-4444-8444-444444444444',
      'https://storage.example.test/storage/v1/object/public/product-images/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/gallery-1.webp',
      'https://storage.example.test/storage/v1/object/public/product-images/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/gallery-2.webp'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'foreign tenant was able to promote another tenant image'; END IF;
END;
$tenant_denial$;

SELECT 'PostgreSQL 17 product gallery reorder and primary promotion acceptance: PASS' AS result;
