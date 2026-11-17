BEGIN;

ALTER TABLE public.storefront_announcements
  ADD COLUMN IF NOT EXISTS visual_key text NOT NULL DEFAULT 'general';

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.storefront_announcements'::regclass
      AND conname='storefront_announcements_visual_key_check'
  ) THEN
    ALTER TABLE public.storefront_announcements
      ADD CONSTRAINT storefront_announcements_visual_key_check
      CHECK (visual_key IN ('food','beverage','cleaning','personal-care','electrical','tools','stationery','general'));
  END IF;
END
$block$;

CREATE OR REPLACE FUNCTION public.get_public_storefront_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_settings jsonb;
BEGIN
  IF public.public_storefront_organization_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Public storefront tenant is not configured';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_object_agg(s.key, s.value), '{}'::jsonb)
    INTO v_settings
  FROM public.admin_settings AS s
  WHERE s.organization_id = public.public_storefront_organization_id()
    AND s.key IN (
      'theme_primary','theme_accent','hero_title','hero_subtitle','hero_artwork',
      'store_name','store_tagline','store_phone','store_email','store_address',
      'ticker_enabled','ticker_messages'
    );

  RETURN v_settings;
END
$function$;

REVOKE ALL ON FUNCTION public.get_public_storefront_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_storefront_settings() TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_public_storefront_categories();
CREATE FUNCTION public.get_public_storefront_categories()
RETURNS TABLE (
  id uuid,
  name text,
  code text,
  parent_id uuid,
  sort_order integer,
  is_active boolean,
  icon text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT c.id,c.name,c.code,c.parent_id,c.sort_order,c.is_active,
    CASE WHEN c.icon IN ('food','beverage','cleaning','personal-care','electrical','tools','stationery','general')
      THEN c.icon ELSE NULL END AS icon
  FROM public.categories AS c
  WHERE c.organization_id = public.public_storefront_organization_id()
    AND c.is_active = true
  ORDER BY c.sort_order ASC,c.name ASC,c.id ASC;
$function$;
REVOKE ALL ON FUNCTION public.get_public_storefront_categories() FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_storefront_categories() TO anon;

CREATE OR REPLACE FUNCTION public.set_admin_catalog_category_artwork(
  p_category_id uuid,
  p_artwork_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_category public.categories%ROWTYPE;
  v_changed boolean;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       JOIN public.user_roles AS r ON r.profile_id=p.id
       WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org AND p.is_active=true
         AND r.role IN ('admin','manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active admin or manager profile required to change category artwork';
  END IF;

  IF p_category_id IS NULL OR p_artwork_key IS NULL
     OR p_artwork_key NOT IN ('food','beverage','cleaning','personal-care','electrical','tools','stationery','general') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='category artwork key is not supported';
  END IF;

  SELECT c.* INTO v_category
  FROM public.categories AS c
  WHERE c.id=p_category_id AND c.organization_id=v_org AND c.is_active=true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='active category not found in organization';
  END IF;

  v_changed := v_category.icon IS DISTINCT FROM p_artwork_key;
  IF v_changed THEN
    UPDATE public.categories AS c SET icon=p_artwork_key
    WHERE c.id=p_category_id AND c.organization_id=v_org;

    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES (
      v_org,v_actor,'catalog.category_artwork_changed','category',p_category_id,
      pg_catalog.jsonb_build_object('name',v_category.name,'artwork_key',v_category.icon),
      pg_catalog.jsonb_build_object('name',v_category.name,'artwork_key',p_artwork_key)
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object('id',p_category_id,'artwork_key',p_artwork_key,'changed',v_changed);
END
$function$;
REVOKE ALL ON FUNCTION public.set_admin_catalog_category_artwork(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_admin_catalog_category_artwork(uuid,text) TO authenticated;

DROP FUNCTION IF EXISTS public.get_storefront_announcements();
CREATE FUNCTION public.get_storefront_announcements()
RETURNS TABLE (
  id uuid,title text,content text,href text,color text,priority integer,
  starts_at timestamptz,ends_at timestamptz,audience text,visual_key text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid := public.public_storefront_organization_id();
  v_is_customer boolean := false;
  v_is_staff boolean := false;
BEGIN
  IF v_organization_id IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles AS p JOIN public.user_roles AS r ON r.profile_id=p.id
      WHERE p.auth_user_id=auth.uid() AND p.organization_id=v_organization_id AND p.is_active=true AND r.role='customer'
    ) INTO v_is_customer;
    SELECT EXISTS (
      SELECT 1 FROM public.profiles AS p JOIN public.user_roles AS r ON r.profile_id=p.id
      WHERE p.auth_user_id=auth.uid() AND p.organization_id=v_organization_id AND p.is_active=true
        AND r.role IN ('admin','manager','staff','accountant')
    ) INTO v_is_staff;
  END IF;
  RETURN QUERY
  SELECT a.id,a.title,a.content,a.href,a.color,a.priority,a.starts_at,a.ends_at,a.audience,a.visual_key
  FROM public.storefront_announcements AS a
  WHERE a.organization_id=v_organization_id AND a.is_active=true
    AND (a.starts_at IS NULL OR a.starts_at<=pg_catalog.now())
    AND (a.ends_at IS NULL OR a.ends_at>pg_catalog.now())
    AND (a.audience='all' OR (a.audience='customers' AND v_is_customer) OR (a.audience='staff' AND v_is_staff))
  ORDER BY a.priority ASC,a.created_at DESC,a.id LIMIT 10;
END
$function$;
REVOKE ALL ON FUNCTION public.get_storefront_announcements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storefront_announcements() TO anon,authenticated;

DROP FUNCTION IF EXISTS public.get_admin_storefront_announcements();
CREATE FUNCTION public.get_admin_storefront_announcements()
RETURNS TABLE (
  id uuid,title text,content text,href text,color text,priority integer,is_active boolean,
  starts_at timestamptz,ends_at timestamptz,audience text,created_at timestamptz,updated_at timestamptz,visual_key text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid:=public.current_organization_id();
  v_profile_id uuid:=public.current_profile_id();
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p JOIN public.user_roles AS r ON r.profile_id=p.id
    WHERE p.id=v_profile_id AND p.organization_id=v_organization_id AND p.is_active=true AND r.role IN ('admin','manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Storefront announcement management requires an active admin or manager';
  END IF;
  RETURN QUERY SELECT a.id,a.title,a.content,a.href,a.color,a.priority,a.is_active,
    a.starts_at,a.ends_at,a.audience,a.created_at,a.updated_at,a.visual_key
  FROM public.storefront_announcements AS a
  WHERE a.organization_id=v_organization_id
  ORDER BY a.priority ASC,a.created_at DESC,a.id;
END
$function$;
REVOKE ALL ON FUNCTION public.get_admin_storefront_announcements() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_storefront_announcements() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_storefront_announcement(
  p_announcement_id uuid,
  p_title text,
  p_content text,
  p_href text,
  p_color text,
  p_priority integer,
  p_is_active boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_audience text,
  p_visual_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid:=public.current_organization_id();
  v_profile_id uuid:=public.current_profile_id();
  v_title text:=btrim(coalesce(p_title,''));
  v_content text:=nullif(btrim(coalesce(p_content,'')),'');
  v_href text:=nullif(btrim(coalesce(p_href,'')),'');
  v_id uuid:=p_announcement_id;
  v_old jsonb;
  v_row public.storefront_announcements%ROWTYPE;
  v_action text;
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p JOIN public.user_roles AS r ON r.profile_id=p.id
    WHERE p.id=v_profile_id AND p.organization_id=v_organization_id AND p.is_active=true AND r.role IN ('admin','manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Storefront announcement writes require an active admin or manager';
  END IF;
  IF char_length(v_title) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement title must contain 1 to 120 characters';
  END IF;
  IF v_content IS NOT NULL AND char_length(v_content)>600 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement content must not exceed 600 characters';
  END IF;
  IF v_href IS NOT NULL AND NOT (
    (left(v_href,1)='/' AND left(v_href,2)<>'//') OR
    (v_href LIKE 'https://%' AND char_length(v_href)>8 AND v_href !~ '[[:space:]]')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement link must be an internal path or HTTPS URL';
  END IF;
  IF p_color IS NULL OR p_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement color must be a six-digit hex color';
  END IF;
  IF p_priority IS NULL OR p_priority NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement priority must be an integer from 0 to 10000';
  END IF;
  IF p_audience IS NULL OR p_audience NOT IN ('all','customers','staff') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement audience is not supported';
  END IF;
  IF p_visual_key IS NULL OR p_visual_key NOT IN ('food','beverage','cleaning','personal-care','electrical','tools','stationery','general') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement artwork key is not supported';
  END IF;
  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at<=p_starts_at THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement end must be after its start';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.storefront_announcements(
      organization_id,title,content,href,color,priority,is_active,starts_at,ends_at,audience,visual_key,created_by,updated_by
    ) VALUES (
      v_organization_id,v_title,v_content,v_href,p_color,p_priority,coalesce(p_is_active,false),
      p_starts_at,p_ends_at,p_audience,p_visual_key,v_profile_id,v_profile_id
    ) RETURNING * INTO v_row;
    v_id:=v_row.id;
    v_action:='storefront_announcement.created';
  ELSE
    SELECT pg_catalog.to_jsonb(a) INTO v_old
    FROM public.storefront_announcements AS a
    WHERE a.id=v_id AND a.organization_id=v_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Announcement not found for this organization';
    END IF;
    UPDATE public.storefront_announcements AS a SET
      title=v_title,content=v_content,href=v_href,color=p_color,priority=p_priority,
      is_active=coalesce(p_is_active,false),starts_at=p_starts_at,ends_at=p_ends_at,
      audience=p_audience,visual_key=p_visual_key,updated_by=v_profile_id,updated_at=pg_catalog.now()
    WHERE a.id=v_id AND a.organization_id=v_organization_id
    RETURNING a.* INTO v_row;
    v_action:='storefront_announcement.updated';
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_organization_id,v_profile_id,v_action,'storefront_announcement',v_id,v_old,pg_catalog.to_jsonb(v_row));
  RETURN v_id;
END
$function$;
REVOKE ALL ON FUNCTION public.save_storefront_announcement(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_storefront_announcement(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
