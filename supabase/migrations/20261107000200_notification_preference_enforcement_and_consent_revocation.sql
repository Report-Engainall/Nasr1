-- AGH-NOTIFICATION-PREFERENCES-ENFORCEMENT-001
-- Enforce account-scoped in-app notification preferences at the final database sender boundary.
-- External channels remain disabled until an independently verified provider and destination flow exists.

CREATE TABLE IF NOT EXISTS public.notification_delivery_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id text NOT NULL UNIQUE CHECK (char_length(notification_id) BETWEEN 1 AND 160),
  organization_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (char_length(notification_type) BETWEEN 1 AND 80),
  severity text NOT NULL CHECK (severity IN ('CRITICAL','HIGH','NORMAL')),
  reason text NOT NULL CHECK (reason IN (
    'CHANNEL_DISABLED','NOTIFICATION_LEVEL_FILTERED','QUIET_HOURS','PREFERENCES_INVALID'
  )),
  suppressed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS notification_delivery_suppressions_profile_idx
  ON public.notification_delivery_suppressions(organization_id,profile_id,suppressed_at DESC);

ALTER TABLE public.notification_delivery_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notification_delivery_suppressions FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON TABLE public.notification_delivery_suppressions IS
  'Payload-free evidence that an in-app notification was suppressed by the recipient account preferences at the final database insert boundary.';

CREATE OR REPLACE FUNCTION public.enforce_profile_in_app_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_preferences public.profile_personalization_preferences%ROWTYPE;
  v_profile_org uuid;
  v_found boolean := false;
  v_severity text;
  v_reason text;
  v_timezone text;
  v_local_time time;
BEGIN
  -- A profile-scoped notification must derive its tenant from the recipient profile.
  -- Missing tenant is filled from the profile; a caller-supplied cross-tenant scope is rejected.
  IF NEW.profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.organization_id
    INTO v_profile_org
    FROM public.profiles p
   WHERE p.id=NEW.profile_id;
  IF NOT FOUND OR v_profile_org IS NULL THEN
    RETURN NULL;
  END IF;

  IF NEW.organization_id IS NOT NULL
     AND NEW.organization_id IS DISTINCT FROM v_profile_org THEN
    INSERT INTO public.notification_delivery_suppressions(
      notification_id,organization_id,profile_id,notification_type,severity,reason
    )
    VALUES(
      NEW.id::text,v_profile_org,NEW.profile_id,
      pg_catalog.left(coalesce(NEW.type,'unknown'),80),
      'NORMAL','PREFERENCES_INVALID'
    )
    ON CONFLICT(notification_id) DO NOTHING;
    RETURN NULL;
  END IF;
  NEW.organization_id := v_profile_org;

  SELECT p.*
    INTO v_preferences
    FROM public.profile_personalization_preferences p
   WHERE p.organization_id=v_profile_org
     AND p.profile_id=NEW.profile_id;

  v_found := FOUND;

  -- A profile that has never opened its settings retains the published in-app defaults:
  -- IN_APP enabled, ALL notifications, no quiet hours.
  IF NOT v_found THEN
    RETURN NEW;
  END IF;

  v_severity := CASE pg_catalog.lower(coalesce(NEW.type,''))
    WHEN 'critical' THEN 'CRITICAL'
    WHEN 'security' THEN 'CRITICAL'
    WHEN 'warning' THEN 'HIGH'
    WHEN 'error' THEN 'HIGH'
    WHEN 'order' THEN 'HIGH'
    ELSE 'NORMAL'
  END;

  IF NOT ('IN_APP'=ANY(v_preferences.notification_channels)) THEN
    v_reason := 'CHANNEL_DISABLED';
  ELSIF v_preferences.notification_level='CRITICAL' AND v_severity<>'CRITICAL' THEN
    v_reason := 'NOTIFICATION_LEVEL_FILTERED';
  ELSIF v_preferences.notification_level='IMPORTANT' AND v_severity='NORMAL' THEN
    v_reason := 'NOTIFICATION_LEVEL_FILTERED';
  ELSIF v_preferences.quiet_hours_enabled AND v_severity<>'CRITICAL' THEN
    v_timezone := v_preferences.quiet_hours_time_zone;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name=v_timezone
    ) OR v_preferences.quiet_hours_start=v_preferences.quiet_hours_end THEN
      v_reason := 'PREFERENCES_INVALID';
    ELSE
      v_local_time := (
        coalesce(NEW.created_at,clock_timestamp()) AT TIME ZONE v_timezone
      )::time;
      IF v_preferences.quiet_hours_start<v_preferences.quiet_hours_end THEN
        IF v_local_time>=v_preferences.quiet_hours_start
           AND v_local_time<v_preferences.quiet_hours_end THEN
          v_reason := 'QUIET_HOURS';
        END IF;
      ELSIF v_local_time>=v_preferences.quiet_hours_start
         OR v_local_time<v_preferences.quiet_hours_end THEN
        v_reason := 'QUIET_HOURS';
      END IF;
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    INSERT INTO public.notification_delivery_suppressions(
      notification_id,organization_id,profile_id,notification_type,severity,reason
    )
    VALUES(
      NEW.id::text,NEW.organization_id,NEW.profile_id,
      pg_catalog.left(coalesce(NEW.type,'unknown'),80),
      v_severity,v_reason
    )
    ON CONFLICT(notification_id) DO NOTHING;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_profile_in_app_notification_preferences()
  FROM PUBLIC,anon,authenticated,service_role;

DROP TRIGGER IF EXISTS zz_profile_in_app_notification_preferences ON public.notifications;
CREATE TRIGGER zz_profile_in_app_notification_preferences
BEFORE INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_in_app_notification_preferences();

COMMENT ON FUNCTION public.enforce_profile_in_app_notification_preferences() IS
  'Final in-app notification gate: enforces the recipient profile IN_APP channel, notification severity level and IANA quiet hours. Suppression records contain no title/body or contact payload.';

-- Consent is only revocable through the authenticated profile-scoped RPC. There is still no
-- browser INSERT path: new external consent requires a verified destination and a separate
-- explicit capture flow, neither of which is provisioned in this repository.
CREATE OR REPLACE FUNCTION public.revoke_my_personalization_channel_consent(
  p_consent_id uuid,
  p_expected_granted_at timestamptz
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
  v_consent public.profile_notification_channel_consents%ROWTYPE;
BEGIN
  IF p_consent_id IS NULL OR p_expected_granted_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='a consent id and expected grant timestamp are required';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public._my_personalization_profile();
  IF v_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='one active account profile is required';
  END IF;

  SELECT p.profile_id,p.organization_id
    INTO v_profile,v_org
    FROM public._my_personalization_profile() p;

  SELECT c.*
    INTO v_consent
    FROM public.profile_notification_channel_consents c
   WHERE c.id=p_consent_id
     AND c.profile_id=v_profile
     AND c.organization_id=v_org
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='consent is outside the active account scope';
  END IF;
  IF v_consent.granted_at IS DISTINCT FROM p_expected_granted_at THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='consent version changed; reload the consent record';
  END IF;

  IF v_consent.revoked_at IS NULL THEN
    UPDATE public.profile_notification_channel_consents c
       SET revoked_at=pg_catalog.clock_timestamp()
     WHERE c.id=v_consent.id
       AND c.profile_id=v_profile
       AND c.organization_id=v_org
       AND c.revoked_at IS NULL
    RETURNING c.* INTO v_consent;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id',v_consent.id::text,
    'organizationId',v_consent.organization_id::text,
    'profileId',v_consent.profile_id::text,
    'channel',v_consent.channel,
    'destinationId',v_consent.destination_id,
    'destinationLabel',v_consent.destination_label,
    'purpose',v_consent.purpose,
    'dataClasses',pg_catalog.to_jsonb(v_consent.data_classes),
    'grantedAt',v_consent.granted_at,
    'revokedAt',v_consent.revoked_at,
    'consentVersion',v_consent.consent_version,
    'source',v_consent.source,
    'alreadyRevoked',v_consent.revoked_at IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.revoke_my_personalization_channel_consent(uuid,timestamptz)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_my_personalization_channel_consent(uuid,timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.revoke_my_personalization_channel_consent(uuid,timestamptz) IS
  'Allows a profile owner to revoke only its own destination/purpose scoped external notification consent; idempotent after first revocation and never creates consent.';
