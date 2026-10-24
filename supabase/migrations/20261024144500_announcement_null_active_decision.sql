-- AGH-ANNOUNCEMENT-EXPLICIT-ACTIVE-DECISION-001
-- Do not coerce an explicit NULL activation decision into a state-changing false.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_storefront_announcement(
  p_announcement_id uuid,p_title text,p_content text,p_href text,p_color text,p_priority integer,p_is_active boolean,
  p_starts_at timestamptz,p_ends_at timestamptz,p_audience text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid:=public.current_organization_id();
  v_profile_id uuid:=public.current_profile_id();
  v_title text:=btrim(coalesce(p_title,''));
  v_content text:=nullif(btrim(coalesce(p_content,'')),'');
  v_href text:=nullif(btrim(coalesce(p_href,'')),'');
  v_id uuid:=p_announcement_id;
  v_old jsonb; v_new jsonb; v_action text; v_row public.storefront_announcements%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p JOIN public.user_roles AS r ON r.profile_id=p.id
    WHERE p.id=v_profile_id AND p.organization_id=v_organization_id AND p.is_active=true AND r.role IN ('admin','manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Storefront announcement writes require an active admin or manager';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement active status must be explicit';
  END IF;
  IF char_length(v_title) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement title must contain 1 to 120 characters'; END IF;
  IF v_content IS NOT NULL AND char_length(v_content)>600 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement content must not exceed 600 characters'; END IF;
  IF v_href IS NOT NULL AND NOT ((left(v_href,1)='/' AND left(v_href,2)<>'//') OR (v_href LIKE 'https://%' AND char_length(v_href)>8 AND v_href !~ '[[:space:]]')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement link must be an internal path or HTTPS URL';
  END IF;
  IF p_color IS NULL OR p_color !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement color must be a six-digit hex color'; END IF;
  IF p_priority IS NULL OR p_priority NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement priority must be an integer from 0 to 10000'; END IF;
  IF p_audience IS NULL OR p_audience NOT IN ('all','customers','staff') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement audience is not supported'; END IF;
  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at<=p_starts_at THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Announcement end must be after its start'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.storefront_announcements(organization_id,title,content,href,color,priority,is_active,starts_at,ends_at,audience,created_by,updated_by)
    VALUES(v_organization_id,v_title,v_content,v_href,p_color,p_priority,p_is_active,p_starts_at,p_ends_at,p_audience,v_profile_id,v_profile_id)
    RETURNING * INTO v_row;
    v_id:=v_row.id; v_action:='storefront_announcement.created';
  ELSE
    SELECT pg_catalog.to_jsonb(a) INTO v_old FROM public.storefront_announcements AS a
    WHERE a.id=v_id AND a.organization_id=v_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Announcement not found for this organization'; END IF;
    UPDATE public.storefront_announcements AS a SET title=v_title,content=v_content,href=v_href,color=p_color,priority=p_priority,
      is_active=p_is_active,starts_at=p_starts_at,ends_at=p_ends_at,audience=p_audience,
      updated_by=v_profile_id,updated_at=pg_catalog.now()
    WHERE a.id=v_id AND a.organization_id=v_organization_id RETURNING a.* INTO v_row;
    v_action:='storefront_announcement.updated';
  END IF;
  v_new:=pg_catalog.to_jsonb(v_row);
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_organization_id,v_profile_id,v_action,'storefront_announcement',v_id,v_old,v_new);
  RETURN v_id;
END
$function$;
COMMIT;
