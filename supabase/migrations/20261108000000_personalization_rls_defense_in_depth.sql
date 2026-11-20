-- Defense-in-depth: these account-private tables are accessed only through
-- profile-scoped SECURITY DEFINER RPCs defined in prior migrations.
-- No direct client policies are intentionally created.
BEGIN;

ALTER TABLE public.profile_personalization_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_notification_channel_consents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profile_personalization_preferences
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.profile_notification_channel_consents
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.profile_personalization_preferences IS
  'Private per-profile preferences. RLS enabled; access only through profile-scoped SECURITY DEFINER RPCs.';
COMMENT ON TABLE public.profile_notification_channel_consents IS
  'Append-only explicit consent records. RLS enabled; access only through profile-scoped SECURITY DEFINER RPCs.';

COMMIT;
