-- Sanitize the static bootstrap fixtures before Nasr1 is connected to Bolt New.
-- Keep the tenant shell and server-side store preferences; remove demo business activity.
DO $$
DECLARE
  v_org uuid := 'a0000000-0000-0000-0000-000000000001';
  v_profile uuid := 'f0000000-0000-0000-0000-000000000001';
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'Refusing fixture cleanup: auth.users is not empty';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'Expected Nasr1 bootstrap organization was not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.products
    WHERE id NOT IN (
      'a1000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000002',
      'a1000000-0000-0000-0000-000000000003',
      'a1000000-0000-0000-0000-000000000004',
      'a1000000-0000-0000-0000-000000000005',
      'a1000000-0000-0000-0000-000000000006',
      'a1000000-0000-0000-0000-000000000007',
      'a1000000-0000-0000-0000-000000000008',
      'a1000000-0000-0000-0000-000000000009',
      'a1000000-0000-0000-0000-000000000010'
    )
  ) THEN
    RAISE EXCEPTION 'Refusing fixture cleanup: non-fixture products exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customers
    WHERE id NOT IN (
      'c0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000002',
      'c0000000-0000-0000-0000-000000000003',
      'c0000000-0000-0000-0000-000000000004',
      'c0000000-0000-0000-0000-000000000005'
    )
  ) THEN
    RAISE EXCEPTION 'Refusing fixture cleanup: non-fixture customers exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id NOT IN (
      'a2000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000002',
      'a2000000-0000-0000-0000-000000000003'
    )
  ) THEN
    RAISE EXCEPTION 'Refusing fixture cleanup: non-fixture suppliers exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE id NOT IN (
      'a3000000-0000-0000-0000-000000000001',
      'a3000000-0000-0000-0000-000000000002',
      'a3000000-0000-0000-0000-000000000003',
      'a3000000-0000-0000-0000-000000000004',
      'a3000000-0000-0000-0000-000000000005'
    )
  ) THEN
    RAISE EXCEPTION 'Refusing fixture cleanup: non-fixture orders exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id <> v_profile OR auth_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Refusing fixture cleanup: a non-fixture or linked profile exists';
  END IF;

  DELETE FROM public.notifications
  WHERE organization_id = v_org AND profile_id = v_profile;

  DELETE FROM public.ai_tasks
  WHERE organization_id = v_org
    AND title IN (
      'مراجعة طلبات العملاء الجديدة',
      'متابعة مخزون الأصناف المنخفضة',
      'مراجعة تقرير السيولة الأسبوعي'
    );

  DELETE FROM public.ai_alerts
  WHERE organization_id = v_org
    AND title IN (
      'مخزون منخفض: معكرونة إيطالية',
      'مخزون منخفض: زيت دوار الشمس',
      'توصية تسعير: سكر برازيلي',
      'متابعة دفع: سوق الوادي - صنعاء'
    );

  DELETE FROM public.orders
  WHERE id IN (
    'a3000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000002',
    'a3000000-0000-0000-0000-000000000003',
    'a3000000-0000-0000-0000-000000000004',
    'a3000000-0000-0000-0000-000000000005'
  );

  DELETE FROM public.customers
  WHERE id IN (
    'c0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000002',
    'c0000000-0000-0000-0000-000000000003',
    'c0000000-0000-0000-0000-000000000004',
    'c0000000-0000-0000-0000-000000000005'
  );

  DELETE FROM public.products
  WHERE id IN (
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-000000000005',
    'a1000000-0000-0000-0000-000000000006',
    'a1000000-0000-0000-0000-000000000007',
    'a1000000-0000-0000-0000-000000000008',
    'a1000000-0000-0000-0000-000000000009',
    'a1000000-0000-0000-0000-000000000010'
  );

  DELETE FROM public.suppliers
  WHERE id IN (
    'a2000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000002',
    'a2000000-0000-0000-0000-000000000003'
  );

  DELETE FROM public.categories
  WHERE id IN (
    'ca000000-0000-0000-0000-000000000001',
    'ca000000-0000-0000-0000-000000000002',
    'ca000000-0000-0000-0000-000000000003',
    'ca000000-0000-0000-0000-000000000004',
    'ca000000-0000-0000-0000-000000000010',
    'ca000000-0000-0000-0000-000000000011'
  );

  DELETE FROM public.pricing_rules
  WHERE organization_id = v_org
    AND name IN (
      'تسعير تلقائي حسب التغطية',
      'خصم الكميات الكبيرة',
      'تسعير العملاء المميزين',
      'تسعير حسب المواسم'
    );

  DELETE FROM public.promotions
  WHERE organization_id = v_org
    AND title IN (
      'عرض رمضان الكريم',
      'خصم نهاية الأسبوع',
      'عرض الأصناف الجديدة'
    );

  DELETE FROM public.user_roles WHERE profile_id = v_profile;
  DELETE FROM public.profiles WHERE id = v_profile;

  DELETE FROM public.warehouses
  WHERE id = 'd0000000-0000-0000-0000-000000000002';

  DELETE FROM public.branches
  WHERE id = 'b0000000-0000-0000-0000-000000000002';

  UPDATE public.organizations
  SET legal_name = NULL, phone = NULL, email = NULL, address = NULL
  WHERE id = v_org;

  UPDATE public.branches
  SET name = 'الفرع الرئيسي', code = 'BR-MAIN', address = NULL, phone = NULL
  WHERE id = 'b0000000-0000-0000-0000-000000000001';

  UPDATE public.warehouses
  SET name = 'المخزن الرئيسي', code = 'WH-MAIN-01'
  WHERE id = 'd0000000-0000-0000-0000-000000000001';
END $$;
