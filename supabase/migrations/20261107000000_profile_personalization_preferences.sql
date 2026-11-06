-- AGH-PROFILE-PERSONALIZATION-001
-- Account-scoped notification and privacy preferences. All access is through SECURITY DEFINER RPCs.
CREATE TABLE IF NOT EXISTS public.profile_personalization_preferences (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  notification_channels text[] NOT NULL DEFAULT ARRAY['IN_APP']::text[],
  notification_level text NOT NULL DEFAULT 'ALL',
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start time NOT NULL DEFAULT TIME '22:00',
  quiet_hours_end time NOT NULL DEFAULT TIME '07:00',
  quiet_hours_time_zone text NOT NULL DEFAULT 'UTC',
  detail_level text NOT NULL DEFAULT 'SUMMARY',
  reduced_motion boolean NOT NULL DEFAULT false,
  personalization_enabled boolean NOT NULL DEFAULT false,
  external_processing_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT profile_personalization_notification_level_check
    CHECK (notification_level IN ('ALL','IMPORTANT','CRITICAL')),
  CONSTRAINT profile_personalization_detail_level_check
    CHECK (detail_level IN ('SUMMARY','STANDARD')),
  CONSTRAINT profile_personalization_channels_check
    CHECK (cardinality(notification_channels) <= 4
      AND notification_channels <@ ARRAY['IN_APP','EMAIL','WHATSAPP','SMS']::text[]),
  CONSTRAINT profile_personalization_quiet_time_check
    CHECK (NOT quiet_hours_enabled OR quiet_hours_start <> quiet_hours_end),
  CONSTRAINT profile_personalization_timezone_length_check
    CHECK (char_length(quiet_hours_time_zone) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS profile_personalization_org_profile_idx
  ON public.profile_personalization_preferences(organization_id,profile_id);

COMMENT ON TABLE public.profile_personalization_preferences IS
  'Private per-profile notification, quiet-hours, motion, personalization and external-processing preferences. Accessed only through account-scoped RPCs.';

CREATE TABLE IF NOT EXISTS public.profile_notification_channel_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP','SMS')),
  destination_id text NOT NULL CHECK (char_length(destination_id) BETWEEN 1 AND 512),
  destination_label text NOT NULL CHECK (char_length(destination_label) BETWEEN 1 AND 160),
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 160),
  data_classes text[] NOT NULL CHECK (
    cardinality(data_classes) > 0
    AND data_classes <@ ARRAY['GENERAL','RECOMMENDATION','ACCOUNT_STATEMENT','SENSITIVE_TASK_LIST','CUSTOMER_PERSONAL_DATA']::text[]
  ),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  consent_version text NOT NULL CHECK (char_length(consent_version) BETWEEN 1 AND 80),
  source text NOT NULL DEFAULT 'EXPLICIT_USER_ACTION'
    CHECK (source = 'EXPLICIT_USER_ACTION'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT profile_notification_consent_revocation_check
    CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_notification_consent_active_scope_uidx
  ON public.profile_notification_channel_consents(
    organization_id,profile_id,channel,destination_id,purpose
  ) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS profile_notification_consent_profile_idx
  ON public.profile_notification_channel_consents(
    organization_id,profile_id,channel,granted_at DESC
  );

COMMENT ON TABLE public.profile_notification_channel_consents IS
  'Append-only explicit consent scope by profile, channel, destination, purpose and data classes. Revocation timestamps close a consent; no global consent is inferred.';

REVOKE ALL ON TABLE public.profile_personalization_preferences FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.profile_notification_channel_consents FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._my_personalization_profile()
RETURNS TABLE(profile_id uuid,organization_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.id,p.organization_id
  FROM public.profiles p
  WHERE p.auth_user_id=auth.uid()
    AND p.is_active
  ORDER BY p.id
  LIMIT 2;
END;
$function$;

REVOKE ALL ON FUNCTION public._my_personalization_profile() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.fetch_my_personalization_preferences()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_profile uuid;
  v_org uuid;
  v_count integer;
  v_row public.profile_personalization_preferences%ROWTYPE;
BEGIN
  SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public._my_personalization_profile();
  IF v_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='one active account profile is required';
  END IF;
  SELECT p.profile_id,p.organization_id
    INTO v_profile,v_org
    FROM public._my_personalization_profile() p;

  INSERT INTO public.profile_personalization_preferences(profile_id,organization_id)
  VALUES(v_profile,v_org)
  ON CONFLICT(profile_id) DO UPDATE
    SET organization_id=EXCLUDED.organization_id
    WHERE public.profile_personalization_preferences.organization_id IS DISTINCT FROM EXCLUDED.organization_id;

  SELECT * INTO v_row
  FROM public.profile_personalization_preferences p
  WHERE p.profile_id=v_profile AND p.organization_id=v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='personalization settings are outside the active account scope';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'organizationId',v_row.organization_id::text,
    'profileId',v_row.profile_id::text,
    'updatedAt',v_row.updated_at,
    'notificationChannels',pg_catalog.to_jsonb(v_row.notification_channels),
    'notificationLevel',v_row.notification_level,
    'quietHours',pg_catalog.jsonb_build_object(
      'enabled',v_row.quiet_hours_enabled,
      'startLocal',pg_catalog.to_char(v_row.quiet_hours_start,'HH24:MI'),
      'endLocal',pg_catalog.to_char(v_row.quiet_hours_end,'HH24:MI'),
      'timeZone',v_row.quiet_hours_time_zone
    ),
    'detailLevel',v_row.detail_level,
    'reducedMotion',v_row.reduced_motion,
    'personalizationEnabled',v_row.personalization_enabled,
    'externalProcessingEnabled',v_row.external_processing_enabled
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_my_personalization_preferences() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_my_personalization_preferences() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_my_personalization_preferences(
  p_expected_updated_at timestamptz,
  p_changes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_profile uuid;
  v_org uuid;
  v_count integer;
  v_row public.profile_personalization_preferences%ROWTYPE;
  v_channels text[];
  v_level text;
  v_detail text;
  v_quiet jsonb;
  v_quiet_enabled boolean;
  v_start time;
  v_end time;
  v_time_zone text;
  v_reduced boolean;
  v_personalized boolean;
  v_external boolean;
BEGIN
  SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public._my_personalization_profile();
  IF v_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='one active account profile is required';
  END IF;
  SELECT p.profile_id,p.organization_id
    INTO v_profile,v_org
    FROM public._my_personalization_profile() p;
  IF p_expected_updated_at IS NULL OR p_changes IS NULL OR pg_catalog.jsonb_typeof(p_changes)<>'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid personalization update';
  END IF;

  SELECT * INTO v_row
  FROM public.profile_personalization_preferences p
  WHERE p.profile_id=v_profile AND p.organization_id=v_org
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='personalization settings must be loaded before update';
  END IF;
  IF v_row.updated_at<>p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='personalization settings version changed';
  END IF;

  IF pg_catalog.jsonb_typeof(p_changes->'notificationChannels') IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_typeof(p_changes->'quietHours') IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(p_changes->'reducedMotion') IS DISTINCT FROM 'boolean'
     OR pg_catalog.jsonb_typeof(p_changes->'personalizationEnabled') IS DISTINCT FROM 'boolean'
     OR pg_catalog.jsonb_typeof(p_changes->'externalProcessingEnabled') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='personalization fields are incomplete';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(x.value ORDER BY x.ordinality),ARRAY[]::text[])
    INTO v_channels
    FROM pg_catalog.jsonb_array_elements_text(p_changes->'notificationChannels') WITH ORDINALITY AS x(value,ordinality);
  IF pg_catalog.cardinality(v_channels)>4
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(v_channels) AS x(value)
                WHERE x.value NOT IN ('IN_APP','EMAIL','WHATSAPP','SMS'))
     OR pg_catalog.cardinality(v_channels)<>
        (SELECT pg_catalog.count(DISTINCT x.value)::integer FROM pg_catalog.unnest(v_channels) AS x(value)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid or duplicate notification channel';
  END IF;

  v_level:=p_changes->>'notificationLevel';
  v_detail:=p_changes->>'detailLevel';
  v_quiet:=p_changes->'quietHours';
  IF v_level IS NULL OR v_level NOT IN ('ALL','IMPORTANT','CRITICAL')
     OR v_detail IS NULL OR v_detail NOT IN ('SUMMARY','STANDARD')
     OR pg_catalog.jsonb_typeof(v_quiet->'enabled') IS DISTINCT FROM 'boolean'
     OR pg_catalog.jsonb_typeof(v_quiet->'startLocal') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(v_quiet->'endLocal') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(v_quiet->'timeZone') IS DISTINCT FROM 'string'
     OR (v_quiet->>'startLocal') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR (v_quiet->>'endLocal') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid notification or quiet-hours settings';
  END IF;

  v_quiet_enabled:=(v_quiet->>'enabled')::boolean;
  v_start:=(v_quiet->>'startLocal')::time;
  v_end:=(v_quiet->>'endLocal')::time;
  v_time_zone:=pg_catalog.btrim(v_quiet->>'timeZone');
  IF pg_catalog.char_length(v_time_zone) NOT BETWEEN 1 AND 80
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name=v_time_zone)
     OR (v_quiet_enabled AND v_start=v_end) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid quiet-hours timezone or range';
  END IF;

  v_reduced:=(p_changes->>'reducedMotion')::boolean;
  v_personalized:=(p_changes->>'personalizationEnabled')::boolean;
  v_external:=(p_changes->>'externalProcessingEnabled')::boolean;

  UPDATE public.profile_personalization_preferences
  SET notification_channels=v_channels,
      notification_level=v_level,
      quiet_hours_enabled=v_quiet_enabled,
      quiet_hours_start=v_start,
      quiet_hours_end=v_end,
      quiet_hours_time_zone=v_time_zone,
      detail_level=v_detail,
      reduced_motion=v_reduced,
      personalization_enabled=v_personalized,
      external_processing_enabled=v_external,
      updated_at=pg_catalog.clock_timestamp()
  WHERE profile_id=v_profile AND organization_id=v_org
  RETURNING * INTO v_row;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'organizationId',v_row.organization_id::text,
    'profileId',v_row.profile_id::text,
    'updatedAt',v_row.updated_at,
    'notificationChannels',pg_catalog.to_jsonb(v_row.notification_channels),
    'notificationLevel',v_row.notification_level,
    'quietHours',pg_catalog.jsonb_build_object(
      'enabled',v_row.quiet_hours_enabled,
      'startLocal',pg_catalog.to_char(v_row.quiet_hours_start,'HH24:MI'),
      'endLocal',pg_catalog.to_char(v_row.quiet_hours_end,'HH24:MI'),
      'timeZone',v_row.quiet_hours_time_zone
    ),
    'detailLevel',v_row.detail_level,
    'reducedMotion',v_row.reduced_motion,
    'personalizationEnabled',v_row.personalization_enabled,
    'externalProcessingEnabled',v_row.external_processing_enabled
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.save_my_personalization_preferences(timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_my_personalization_preferences(timestamptz,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_my_personalization_consents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_profile uuid;
  v_org uuid;
  v_count integer;
BEGIN
  SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public._my_personalization_profile();
  IF v_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='one active account profile is required';
  END IF;
  SELECT p.profile_id,p.organization_id
    INTO v_profile,v_org
    FROM public._my_personalization_profile() p;

  RETURN pg_catalog.jsonb_build_object(
    'consents',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',c.id::text,
        'organizationId',c.organization_id::text,
        'profileId',c.profile_id::text,
        'channel',c.channel,
        'destinationId',c.destination_id,
        'destinationLabel',c.destination_label,
        'purpose',c.purpose,
        'dataClasses',pg_catalog.to_jsonb(c.data_classes),
        'grantedAt',c.granted_at,
        'revokedAt',c.revoked_at,
        'consentVersion',c.consent_version,
        'source',c.source
      ) ORDER BY c.granted_at DESC)
      FROM public.profile_notification_channel_consents c
      WHERE c.organization_id=v_org AND c.profile_id=v_profile
    ),'[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_my_personalization_consents() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_my_personalization_consents() TO authenticated;

-- Deliberately no client INSERT/UPDATE grant for consent rows:
-- until an independently verified destination and explicit capture workflow exist,
-- absence of a consent record must remain a deny, not a browser-created approval.
