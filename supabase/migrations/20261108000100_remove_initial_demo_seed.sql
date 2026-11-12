-- Remove only the deterministic demo records inserted by the original bootstrap migration.
-- Preserve the organization shell, database schema, operational singleton settings and all later defaults.
BEGIN;

-- Demo notifications and assistant content are tied to the synthetic, auth-less profile.
DELETE FROM public.notifications
 WHERE profile_id = 'f0000000-0000-0000-0000-000000000001'::uuid;
DELETE FROM public.ai_alerts
 WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid;
DELETE FROM public.ai_tasks
 WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Remove synthetic orders first; their order lines and status history are dependent records.
DELETE FROM public.orders
 WHERE id IN (
   'a3000000-0000-0000-0000-000000000001'::uuid,
   'a3000000-0000-0000-0000-000000000002'::uuid,
   'a3000000-0000-0000-0000-000000000003'::uuid,
   'a3000000-0000-0000-0000-000000000004'::uuid,
   'a3000000-0000-0000-0000-000000000005'::uuid
 );

DELETE FROM public.product_prices
 WHERE product_id IN (
   'a1000000-0000-0000-0000-000000000001'::uuid,
   'a1000000-0000-0000-0000-000000000002'::uuid,
   'a1000000-0000-0000-0000-000000000003'::uuid,
   'a1000000-0000-0000-0000-000000000004'::uuid,
   'a1000000-0000-0000-0000-000000000005'::uuid,
   'a1000000-0000-0000-0000-000000000006'::uuid,
   'a1000000-0000-0000-0000-000000000007'::uuid,
   'a1000000-0000-0000-0000-000000000008'::uuid,
   'a1000000-0000-0000-0000-000000000009'::uuid,
   'a1000000-0000-0000-0000-000000000010'::uuid
 );

DELETE FROM public.inventory_balances
 WHERE product_id IN (
   'a1000000-0000-0000-0000-000000000001'::uuid,
   'a1000000-0000-0000-0000-000000000002'::uuid,
   'a1000000-0000-0000-0000-000000000003'::uuid,
   'a1000000-0000-0000-0000-000000000004'::uuid,
   'a1000000-0000-0000-0000-000000000005'::uuid,
   'a1000000-0000-0000-0000-000000000006'::uuid,
   'a1000000-0000-0000-0000-000000000007'::uuid,
   'a1000000-0000-0000-0000-000000000008'::uuid,
   'a1000000-0000-0000-0000-000000000009'::uuid,
   'a1000000-0000-0000-0000-000000000010'::uuid
 );

DELETE FROM public.products
 WHERE id IN (
   'a1000000-0000-0000-0000-000000000001'::uuid,
   'a1000000-0000-0000-0000-000000000002'::uuid,
   'a1000000-0000-0000-0000-000000000003'::uuid,
   'a1000000-0000-0000-0000-000000000004'::uuid,
   'a1000000-0000-0000-0000-000000000005'::uuid,
   'a1000000-0000-0000-0000-000000000006'::uuid,
   'a1000000-0000-0000-0000-000000000007'::uuid,
   'a1000000-0000-0000-0000-000000000008'::uuid,
   'a1000000-0000-0000-0000-000000000009'::uuid,
   'a1000000-0000-0000-0000-000000000010'::uuid
 );

DELETE FROM public.categories
 WHERE id IN (
   'ca000000-0000-0000-0000-000000000001'::uuid,
   'ca000000-0000-0000-0000-000000000002'::uuid,
   'ca000000-0000-0000-0000-000000000003'::uuid,
   'ca000000-0000-0000-0000-000000000004'::uuid,
   'ca000000-0000-0000-0000-000000000010'::uuid,
   'ca000000-0000-0000-0000-000000000011'::uuid
 );

DELETE FROM public.customers
 WHERE id IN (
   'c0000000-0000-0000-0000-000000000001'::uuid,
   'c0000000-0000-0000-0000-000000000002'::uuid,
   'c0000000-0000-0000-0000-000000000003'::uuid,
   'c0000000-0000-0000-0000-000000000004'::uuid,
   'c0000000-0000-0000-0000-000000000005'::uuid
 );

DELETE FROM public.suppliers
 WHERE id IN (
   'a2000000-0000-0000-0000-000000000001'::uuid,
   'a2000000-0000-0000-0000-000000000002'::uuid,
   'a2000000-0000-0000-0000-000000000003'::uuid
 );

DELETE FROM public.pricing_rules
 WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid
   AND name IN ('تسعير تلقائي حسب التغطية','خصم الكميات الكبيرة','تسعير العملاء المميزين','تسعير حسب المواسم');

DELETE FROM public.promotions
 WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid
   AND title IN ('عرض رمضان الكريم','خصم نهاية الأسبوع','عرض الأصناف الجديدة');

DELETE FROM public.user_roles
 WHERE profile_id = 'f0000000-0000-0000-0000-000000000001'::uuid;
DELETE FROM public.profiles
 WHERE id = 'f0000000-0000-0000-0000-000000000001'::uuid
   AND auth_user_id IS NULL;

DELETE FROM public.branches
 WHERE id IN (
   'b0000000-0000-0000-0000-000000000001'::uuid,
   'b0000000-0000-0000-0000-000000000002'::uuid
 );
DELETE FROM public.warehouses
 WHERE id IN (
   'd0000000-0000-0000-0000-000000000001'::uuid,
   'd0000000-0000-0000-0000-000000000002'::uuid
 );

-- Keep safe defaults; do not activate automatic pricing or publish a store without real data.
UPDATE public.admin_settings
   SET value = pg_catalog.to_jsonb('متجر الأغبري'::text),
       updated_at = pg_catalog.clock_timestamp()
 WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid
   AND key = 'brand_name';

UPDATE public.admin_settings
   SET value = 'false'::jsonb,
       updated_at = pg_catalog.clock_timestamp()
 WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid
   AND key = 'auto_pricing_enabled';

UPDATE public.storefront_publication_config
   SET is_enabled = false,
       warehouse_id = NULL,
       updated_at = pg_catalog.clock_timestamp()
 WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Retain the organization as the empty Nasr1 tenant; remove fake contact details.
UPDATE public.organizations
   SET name = 'متجر الأغبري',
       legal_name = NULL,
       tax_number = NULL,
       phone = NULL,
       email = NULL,
       address = NULL,
       updated_at = pg_catalog.clock_timestamp()
 WHERE id = 'a0000000-0000-0000-0000-000000000001'::uuid
   AND name = 'الأغبري للمواد الغذائية';

COMMIT;
