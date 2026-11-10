-- Enforce source-job type at the database boundary before any replay or application.
-- Products snapshots can only use the product path; customer snapshots only the customer path.
BEGIN;

create table if not exists public.admin_import_application_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  snapshot_id uuid not null references public.onyx_snapshots(id) on delete restrict,
  import_kind text not null check (import_kind in ('products', 'customers')),
  idempotency_key text not null,
  created_by uuid references public.profiles(id) on delete set null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint admin_import_application_runs_org_snapshot_kind_key
    unique (organization_id, snapshot_id, import_kind),
  constraint admin_import_application_runs_org_key_key
    unique (organization_id, idempotency_key)
);

alter table public.admin_import_application_runs enable row level security;
revoke all on table public.admin_import_application_runs from anon, authenticated;

create or replace function public.apply_admin_import_snapshot(
  p_snapshot_id uuid,
  p_import_kind text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_snapshot public.onyx_snapshots%rowtype;
  v_prior public.admin_import_application_runs%rowtype;
  v_row public.onyx_snapshot_rows%rowtype;
  v_row_count integer := 0;
  v_created integer := 0;
  v_skipped integer := 0;
  v_rejected integer := 0;
  v_price_review integer := 0;
  v_category_review integer := 0;
  v_stock_pending integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_seen_codes text[] := array[]::text[];
  v_code text;
  v_name text;
  v_unit text;
  v_business_name text;
  v_category_name text;
  v_category_id uuid;
  v_base_text text;
  v_vip_text text;
  v_wholesale_text text;
  v_retail_text text;
  v_base numeric(14,2);
  v_vip numeric(14,2);
  v_wholesale numeric(14,2);
  v_retail numeric(14,2);
  v_prices_complete boolean;
  v_customer_id uuid;
  v_product_result jsonb;
  v_payload jsonb;
  v_job_status text;
  v_job_type text;
  v_result jsonb;
begin
  if auth.uid() is null or v_actor is null or v_org is null
     or not exists (
       select 1 from public.profiles p
        where p.id = v_actor and p.auth_user_id = auth.uid()
          and p.organization_id = v_org and p.is_active
     )
     or not exists (
       select 1 from public.user_roles r
        where r.profile_id = v_actor and r.role in ('admin', 'manager')
     ) then
    raise exception using errcode = '42501', message = 'active admin or manager required to apply an import snapshot';
  end if;

  if p_snapshot_id is null
     or p_import_kind is null
     or p_import_kind not in ('products', 'customers')
     or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9_-]{16,128}$' then
    raise exception using errcode = '22023', message = 'snapshot, import kind, and valid idempotency key are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':admin-import:' || p_import_kind || ':' || p_snapshot_id::text, 0)
  );

  -- Resolve the source snapshot and its tenant-scoped import job before checking
  -- idempotent replay. The requested target type must never override source identity.
  select s.* into v_snapshot
    from public.onyx_snapshots s
   where s.id = p_snapshot_id
     and s.organization_id = v_org
     and s.status = 'ready'
   for share;

  if not found or v_snapshot.data_quality_score < 75 then
    raise exception using errcode = '22023', message = 'only a ready Onyx snapshot with quality score 75 or higher can be applied';
  end if;

  select j.status, j.job_type
    into v_job_status, v_job_type
    from public.import_jobs j
   where j.id = v_snapshot.source_import_job_id
     and j.organization_id = v_org
   for share;

  if not found or v_job_status not in ('completed', 'completed_with_warnings') then
    raise exception using errcode = '22023', message = 'source import job is not in an accepted terminal state';
  end if;

  if (p_import_kind = 'customers' and v_job_type <> 'unified_import_customers')
     or (p_import_kind = 'products' and v_job_type not in ('unified_import_products', 'unified_import')) then
    raise exception using errcode = '22023',
      message = 'selected import kind does not match the snapshot source job type';
  end if;

  select r.* into v_prior
    from public.admin_import_application_runs r
   where r.organization_id = v_org
     and r.snapshot_id = p_snapshot_id
     and r.import_kind = p_import_kind
   for update;

  if found then
    return v_prior.result || pg_catalog.jsonb_build_object('idempotent_replay', true);
  end if;

  select count(*)::integer into v_row_count
    from public.onyx_snapshot_rows r
   where r.snapshot_id = v_snapshot.id
     and r.organization_id = v_org;

  if v_row_count = 0 or v_row_count <> v_snapshot.row_count or v_row_count > 5000 then
    raise exception using errcode = '22023', message = 'snapshot row count is empty, inconsistent, or exceeds the 5000-row application limit';
  end if;

  for v_row in
    select r.* from public.onyx_snapshot_rows r
     where r.snapshot_id = v_snapshot.id
       and r.organization_id = v_org
     order by r.row_number, r.id
  loop
    if v_row.status not in ('valid', 'warning') then
      v_rejected := v_rejected + 1;
      if pg_catalog.jsonb_array_length(v_errors) < 50 then
        v_errors := v_errors || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('row_number', v_row.row_number, 'reason', 'source_row_not_valid')
        );
      end if;
      continue;
    end if;

    if p_import_kind = 'products' then
      v_code := pg_catalog.upper(pg_catalog.btrim(coalesce(v_row.data->>'item_code', v_row.canonical_key, '')));
      v_name := pg_catalog.btrim(coalesce(v_row.data->>'product_name', v_row.data->>'name', ''));
      v_unit := pg_catalog.btrim(coalesce(v_row.data->>'unit', ''));

      if v_code = '' or pg_catalog.length(v_code) > 100
         or v_name = '' or pg_catalog.length(v_name) > 200
         or v_unit = '' or pg_catalog.length(v_unit) > 40 then
        v_rejected := v_rejected + 1;
        if pg_catalog.jsonb_array_length(v_errors) < 50 then
          v_errors := v_errors || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('row_number', v_row.row_number, 'reason', 'product_code_name_or_unit_missing_or_invalid')
          );
        end if;
        continue;
      end if;

      if v_code = any(v_seen_codes) or exists (
        select 1 from public.products p
         where p.organization_id = v_org and pg_catalog.upper(pg_catalog.btrim(p.item_code)) = v_code
      ) then
        v_seen_codes := pg_catalog.array_append(v_seen_codes, v_code);
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_seen_codes := pg_catalog.array_append(v_seen_codes, v_code);

      v_category_id := null;
      v_category_name := nullif(pg_catalog.btrim(coalesce(v_row.data->>'category_name', '')), '');
      if v_category_name is not null then
        select c.id into v_category_id
          from public.categories c
         where c.organization_id = v_org
           and c.is_active
           and pg_catalog.lower(pg_catalog.btrim(c.name)) = pg_catalog.lower(v_category_name)
         order by c.id
         limit 1;
      end if;
      if v_category_id is null then
        v_category_review := v_category_review + 1;
      end if;

      v_base_text := nullif(pg_catalog.btrim(coalesce(v_row.data->>'base_price', '')), '');
      v_vip_text := nullif(pg_catalog.btrim(coalesce(v_row.data->>'price_wholesale_of_wholesale', '')), '');
      v_wholesale_text := nullif(pg_catalog.btrim(coalesce(v_row.data->>'price_wholesale', '')), '');
      v_retail_text := nullif(pg_catalog.btrim(coalesce(v_row.data->>'price_retail', '')), '');
      v_prices_complete :=
        coalesce(v_base_text, '') ~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,2})?$'
        and coalesce(v_vip_text, '') ~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,2})?$'
        and coalesce(v_wholesale_text, '') ~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,2})?$'
        and coalesce(v_retail_text, '') ~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,2})?$';

      if v_prices_complete then
        v_prices_complete := v_base_text::numeric > 0
          and v_vip_text::numeric > 0
          and v_wholesale_text::numeric > 0
          and v_retail_text::numeric > 0;
      end if;

      if not v_prices_complete then
        -- Keep the source row in the immutable review snapshot. Never invent zero
        -- values for missing tier prices and never create a product that could leak them.
        v_price_review := v_price_review + 1;
        v_rejected := v_rejected + 1;
        if pg_catalog.jsonb_array_length(v_errors) < 50 then
          v_errors := v_errors || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'row_number', v_row.row_number,
              'reason', 'product_price_tiers_missing_or_invalid_review_required'
            )
          );
        end if;
        continue;
      end if;

      v_base := v_base_text::numeric;
      v_vip := v_vip_text::numeric;
      v_wholesale := v_wholesale_text::numeric;
      v_retail := v_retail_text::numeric;

      v_payload := pg_catalog.jsonb_build_object(
        'name', v_name,
        'item_code', v_code,
        'barcode', nullif(pg_catalog.btrim(coalesce(v_row.data->>'barcode', '')), ''),
        'unit', v_unit,
        'description', nullif(pg_catalog.left(pg_catalog.btrim(coalesce(v_row.data->>'description', '')), 2000), ''),
        'category_id', v_category_id,
        'base_price', v_base,
        'price_wholesale_of_wholesale', v_vip,
        'price_wholesale', v_wholesale,
        'price_retail', v_retail,
        'status', 'inactive'
      );

      begin
        v_product_result := public.save_admin_catalog_product(null, v_payload);
        RAISE NOTICE 'P1_APPLY_PRODUCT_SAVE_RETURN=%', coalesce(v_product_result::text, 'NULL');
        v_created := v_created + 1;
        RAISE NOTICE 'P1_APPLY_PRODUCT_CREATED_COUNT=%', v_created;
        if coalesce(v_row.data->>'warehouse_name', '') <> ''
           and coalesce(v_row.data->>'quantity', '') <> '' then
          v_stock_pending := v_stock_pending + 1;
        end if;
      exception when others then
        RAISE NOTICE 'P1_APPLY_PRODUCT_FAILURE=%', SQLERRM;
        v_rejected := v_rejected + 1;
        if pg_catalog.jsonb_array_length(v_errors) < 50 then
          v_errors := v_errors || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'row_number', v_row.row_number,
              'reason', pg_catalog.left(SQLERRM, 240)
            )
          );
        end if;
      end;

    else
      v_code := pg_catalog.upper(pg_catalog.btrim(coalesce(v_row.data->>'customer_code', v_row.canonical_key, '')));
      v_business_name := pg_catalog.btrim(coalesce(v_row.data->>'business_name', v_row.data->>'customer_name', ''));

      if v_code = '' or pg_catalog.length(v_code) > 100
         or v_business_name = '' or pg_catalog.length(v_business_name) > 200 then
        v_rejected := v_rejected + 1;
        if pg_catalog.jsonb_array_length(v_errors) < 50 then
          v_errors := v_errors || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('row_number', v_row.row_number, 'reason', 'customer_code_or_business_name_missing_or_invalid')
          );
        end if;
        continue;
      end if;

      if v_code = any(v_seen_codes) or exists (
        select 1 from public.customers c
         where c.organization_id = v_org and pg_catalog.upper(pg_catalog.btrim(c.customer_code)) = v_code
      ) then
        v_seen_codes := pg_catalog.array_append(v_seen_codes, v_code);
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_seen_codes := pg_catalog.array_append(v_seen_codes, v_code);

      if pg_catalog.length(coalesce(v_row.data->>'phone', '')) > 50
         or pg_catalog.length(coalesce(v_row.data->>'email', '')) > 254
         or pg_catalog.length(coalesce(v_row.data->>'address', '')) > 500 then
        v_rejected := v_rejected + 1;
        if pg_catalog.jsonb_array_length(v_errors) < 50 then
          v_errors := v_errors || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('row_number', v_row.row_number, 'reason', 'customer_contact_field_too_long')
          );
        end if;
        continue;
      end if;

      begin
        insert into public.customers(
          organization_id, customer_code, business_name, contact_name, phone, email, address,
          tier, status
        ) values (
          v_org,
          v_code,
          v_business_name,
          nullif(pg_catalog.left(pg_catalog.btrim(coalesce(v_row.data->>'contact_name', '')), 120), ''),
          nullif(pg_catalog.left(pg_catalog.btrim(coalesce(v_row.data->>'phone', '')), 50), ''),
          nullif(pg_catalog.left(pg_catalog.btrim(coalesce(v_row.data->>'email', '')), 254), ''),
          nullif(pg_catalog.left(pg_catalog.btrim(coalesce(v_row.data->>'address', '')), 500), ''),
          'retail',
          'pending'
        )
        returning id into v_customer_id;

        insert into public.audit_logs(
          organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
        ) values (
          v_org, v_actor, 'customer.imported_pending', 'customer', v_customer_id, '{}'::jsonb,
          pg_catalog.jsonb_build_object(
            'customer_code', v_code,
            'business_name', v_business_name,
            'tier', 'retail',
            'status', 'pending',
            'source_snapshot_id', p_snapshot_id
          )
        );
        v_created := v_created + 1;
      exception when others then
        v_rejected := v_rejected + 1;
        if pg_catalog.jsonb_array_length(v_errors) < 50 then
          v_errors := v_errors || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'row_number', v_row.row_number,
              'reason', pg_catalog.left(SQLERRM, 240)
            )
          );
        end if;
      end;
    end if;
  end loop;

  if v_created = 0 and v_skipped = 0 then
    raise exception using errcode = '22023',
      message = 'no valid rows matched the selected import type; choose the correct type or repair the source file';
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'snapshot_id', p_snapshot_id,
    'import_kind', p_import_kind,
    'source_rows', v_row_count,
    'created', v_created,
    'skipped_duplicates', v_skipped,
    'rejected', v_rejected,
    'products_needing_price_review', case when p_import_kind = 'products' then v_price_review else 0 end,
    'products_needing_category_review', case when p_import_kind = 'products' then v_category_review else 0 end,
    'stock_rows_pending_reconciliation', case when p_import_kind = 'products' then v_stock_pending else 0 end,
    'row_errors_truncated', v_rejected > pg_catalog.jsonb_array_length(v_errors),
    'row_errors', v_errors,
    'status', 'applied',
    'idempotent_replay', false
  );

  insert into public.admin_import_application_runs(
    organization_id, snapshot_id, import_kind, idempotency_key, created_by, result
  ) values (
    v_org, p_snapshot_id, p_import_kind, p_idempotency_key, v_actor, v_result
  );

  insert into public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) values (
    v_org, v_actor, 'catalog.import_snapshot_applied', 'onyx_snapshot', p_snapshot_id, '{}'::jsonb,
    v_result
  );

  return v_result;
end;
$function$;

revoke all on function public.apply_admin_import_snapshot(uuid, text, text) from public, anon;
grant execute on function public.apply_admin_import_snapshot(uuid, text, text) to authenticated;

COMMIT;
