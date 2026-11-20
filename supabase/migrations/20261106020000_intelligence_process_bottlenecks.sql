-- REF-SECTION-54: process cycle-time evidence, current queues and comparable-period analysis.
-- Aggregates authoritative status timestamps; never attributes mixed waits to a person or invents a cause.
BEGIN;

CREATE INDEX IF NOT EXISTS process_bottleneck_order_history_idx
  ON public.order_status_history(order_id,created_at,id);
CREATE INDEX IF NOT EXISTS process_bottleneck_task_audit_idx
  ON public.audit_logs(organization_id,entity_type,action,created_at,entity_id)
  WHERE entity_type='ai_task' AND action='operational_task.status_changed';

CREATE OR REPLACE FUNCTION public.fetch_process_bottleneck_snapshot(
  p_from date,
  p_to date,
  p_baseline_from date DEFAULT NULL,
  p_baseline_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_as_of timestamptz:=pg_catalog.now();
  v_can_staff boolean:=public.is_staff();
  v_can_finance boolean:=public.can_manage_finance();
  v_can_purchase boolean:=public.purchase_orders_can_manage();
  v_metrics jsonb:='[]'::jsonb;
  v_counts jsonb:='{}'::jsonb;
  v_queues jsonb:='[]'::jsonb;
  v_coverage jsonb:='[]'::jsonb;
  v_reopened integer:=0;
  v_baseline jsonb;
  v_task_access boolean:=false;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT (v_can_staff OR v_can_finance) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff or finance permission required to read process bottlenecks';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to-p_from>90 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='current period must be valid and no longer than 91 inclusive days';
  END IF;
  IF (p_baseline_from IS NULL)<>(p_baseline_to IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='both baseline dates must be supplied together';
  END IF;
  IF p_baseline_from IS NOT NULL AND (
       p_baseline_from>p_baseline_to
       OR p_baseline_to>=p_from
       OR p_baseline_to-p_baseline_from<>p_to-p_from
       OR p_baseline_to-p_baseline_from>90
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='baseline must be a prior non-overlapping period of equal length';
  END IF;
  v_task_access:=v_can_staff OR EXISTS(
    SELECT 1 FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.id=v_actor AND p.organization_id=v_org AND p.is_active
      AND r.role='accountant'
  );

  WITH windows AS (
    SELECT 'CURRENT'::text AS window_key,
      (p_from::timestamp AT TIME ZONE 'UTC') AS range_start,
      ((p_to+1)::timestamp AT TIME ZONE 'UTC') AS range_end
    UNION ALL
    SELECT 'BASELINE'::text,
      (p_baseline_from::timestamp AT TIME ZONE 'UTC'),
      ((p_baseline_to+1)::timestamp AT TIME ZONE 'UTC')
    WHERE p_baseline_from IS NOT NULL
  ),
  order_history AS (
    SELECT o.id AS order_id,o.created_at,
      h.from_status,h.to_status,h.created_at AS ended_at,
      coalesce(
        lag(h.created_at) OVER (PARTITION BY h.order_id ORDER BY h.created_at,h.id),
        o.created_at
      ) AS started_at
    FROM public.orders o
    JOIN public.order_status_history h ON h.order_id=o.id
    WHERE v_can_staff AND o.organization_id=v_org
  ),
  payment_rollup AS (
    SELECT i.id AS invoice_id,i.organization_id,i.total_amount,
      sum(cp.amount) AS paid_amount,max(cp.paid_at) AS settled_at
    FROM public.customer_invoices i
    JOIN public.customer_payments cp
      ON cp.invoice_id=i.id AND cp.organization_id=i.organization_id
    WHERE v_can_finance AND i.organization_id=v_org
    GROUP BY i.id,i.organization_id,i.total_amount
  ),
  task_completion AS (
    SELECT t.id AS task_id,t.organization_id,t.created_at,
      coalesce(
        min(a.created_at) FILTER (WHERE a.new_value->>'status'='completed'),
        t.completed_at
      ) AS completed_at
    FROM public.ai_tasks t
    LEFT JOIN public.audit_logs a
      ON a.organization_id=t.organization_id
     AND a.entity_type='ai_task' AND a.entity_id=t.id
     AND a.action='operational_task.status_changed'
    WHERE v_task_access AND t.organization_id=v_org
      AND public.can_view_operational_task_role(t.task_role)
    GROUP BY t.id,t.organization_id,t.created_at,t.completed_at
  ),
  purchase_receipt AS (
    SELECT r.organization_id,r.purchase_order_id,min(r.received_at) AS first_received_at
    FROM public.purchase_receipts r
    WHERE v_can_purchase AND r.organization_id=v_org
    GROUP BY r.organization_id,r.purchase_order_id
  ),
  intervals AS (
    SELECT w.window_key,'ORDERS'::text AS process_key,
      coalesce(nullif(h.from_status,''),'CREATED')||' → '||h.to_status AS stage_key,
      'MIXED_OR_UNATTRIBUTED'::text AS wait_class,
      extract(epoch FROM (h.ended_at-h.started_at))::numeric AS duration_seconds,
      h.started_at,h.ended_at
    FROM order_history h
    JOIN windows w ON h.ended_at>=w.range_start AND h.ended_at<w.range_end
    WHERE v_can_staff AND h.started_at IS NOT NULL AND h.ended_at>=h.started_at

    UNION ALL
    SELECT w.window_key,'QUOTES','QUOTE_PREPARATION','INTERNAL_RESPONSE',
      extract(epoch FROM (q.quoted_at-q.created_at))::numeric,q.created_at,q.quoted_at
    FROM public.sales_quotes q
    JOIN windows w ON q.quoted_at>=w.range_start AND q.quoted_at<w.range_end
    WHERE v_can_staff AND q.organization_id=v_org AND q.quoted_at IS NOT NULL
      AND q.quoted_at>=q.created_at AND q.status IN ('quoted','accepted','rejected','expired')

    UNION ALL
    SELECT w.window_key,'PURCHASE','DRAFT_TO_SUBMISSION','INTERNAL_DRAFT_REVIEW',
      extract(epoch FROM (po.submitted_at-po.created_at))::numeric,po.created_at,po.submitted_at
    FROM public.purchase_orders po
    JOIN windows w ON po.submitted_at>=w.range_start AND po.submitted_at<w.range_end
    WHERE v_can_purchase AND po.organization_id=v_org AND po.submitted_at IS NOT NULL
      AND po.submitted_at>=po.created_at

    UNION ALL
    SELECT w.window_key,'PURCHASE','SUBMISSION_TO_FIRST_RECEIPT','MIXED_SUPPLIER_RECEIVING',
      extract(epoch FROM (pr.first_received_at-po.submitted_at))::numeric,po.submitted_at,pr.first_received_at
    FROM public.purchase_orders po
    JOIN purchase_receipt pr
      ON pr.organization_id=po.organization_id AND pr.purchase_order_id=po.id
    JOIN windows w ON pr.first_received_at>=w.range_start AND pr.first_received_at<w.range_end
    WHERE v_can_purchase AND po.organization_id=v_org AND po.submitted_at IS NOT NULL
      AND pr.first_received_at>=po.submitted_at

    UNION ALL
    SELECT w.window_key,'INVOICES','ISSUED_TO_FULL_SETTLEMENT','EXTERNAL_CUSTOMER_SETTLEMENT',
      extract(epoch FROM (pr.settled_at-i.issued_at))::numeric,i.issued_at,pr.settled_at
    FROM public.customer_invoices i
    JOIN payment_rollup pr
      ON pr.organization_id=i.organization_id AND pr.invoice_id=i.id
    JOIN windows w ON pr.settled_at>=w.range_start AND pr.settled_at<w.range_end
    WHERE v_can_finance AND i.organization_id=v_org AND i.status='paid'
      AND pr.paid_amount>=i.total_amount AND pr.settled_at>=i.issued_at

    UNION ALL
    SELECT w.window_key,'TASKS','CREATED_TO_FIRST_COMPLETION','INTERNAL_QUEUE_AND_WORK',
      extract(epoch FROM (tc.completed_at-tc.created_at))::numeric,tc.created_at,tc.completed_at
    FROM task_completion tc
    JOIN windows w ON tc.completed_at>=w.range_start AND tc.completed_at<w.range_end
    WHERE v_task_access AND tc.completed_at IS NOT NULL AND tc.completed_at>=tc.created_at
  ),
  stage_aggregate AS (
    SELECT i.window_key,i.process_key,i.stage_key,i.wait_class,count(*)::integer AS sample_count,
      round(avg(i.duration_seconds)::numeric/60,2) AS average_minutes,
      round((percentile_cont(0.5) WITHIN GROUP (ORDER BY i.duration_seconds))::numeric/60,2) AS median_minutes,
      round((percentile_cont(0.9) WITHIN GROUP (ORDER BY i.duration_seconds))::numeric/60,2) AS p90_minutes,
      min(i.ended_at) AS first_completed_at,max(i.ended_at) AS last_completed_at
    FROM intervals i
    WHERE i.duration_seconds>=0
    GROUP BY i.window_key,i.process_key,i.stage_key,i.wait_class
  ),
  source_aggregate AS (
    SELECT process_key,
      count(*) FILTER (WHERE window_key='CURRENT')::integer AS current_count
    FROM intervals
    GROUP BY process_key
  )
  SELECT
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'window',a.window_key,'processKey',a.process_key,'stageKey',a.stage_key,
        'waitClass',a.wait_class,'sampleCount',a.sample_count,
        'averageMinutes',a.average_minutes,'medianMinutes',a.median_minutes,'p90Minutes',a.p90_minutes,
        'firstCompletedAt',a.first_completed_at,'lastCompletedAt',a.last_completed_at
      ) ORDER BY a.window_key,a.median_minutes DESC,a.process_key,a.stage_key)
      FROM stage_aggregate a
    ),'[]'::jsonb),
    coalesce((
      SELECT jsonb_object_agg(s.process_key,s.current_count)
      FROM source_aggregate s
    ),'{}'::jsonb)
  INTO v_metrics,v_counts;

  WITH queue_rows AS (
    SELECT 'ORDERS'::text AS process_key,count(*)::integer AS open_count,min(o.created_at) AS oldest_at
    FROM public.orders o
    WHERE v_can_staff AND o.organization_id=v_org
      AND o.status IN ('draft','pending','confirmed','processing','shipped')
    UNION ALL
    SELECT 'QUOTES',count(*)::integer,min(q.created_at)
    FROM public.sales_quotes q
    WHERE v_can_staff AND q.organization_id=v_org AND q.status='requested'
    UNION ALL
    SELECT 'PURCHASE',count(*)::integer,min(po.created_at)
    FROM public.purchase_orders po
    WHERE v_can_purchase AND po.organization_id=v_org
      AND po.status IN ('draft','submitted','partially_received')
    UNION ALL
    SELECT 'INVOICES',count(*)::integer,min(i.issued_at)
    FROM public.customer_invoices i
    WHERE v_can_finance AND i.organization_id=v_org
      AND i.status IN ('issued','partially_paid')
    UNION ALL
    SELECT 'TASKS',count(*)::integer,min(t.created_at)
    FROM public.ai_tasks t
    WHERE v_task_access AND t.organization_id=v_org
      AND t.status IN ('pending','in_progress')
      AND public.can_view_operational_task_role(t.task_role)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'processKey',q.process_key,'openCount',q.open_count,
    'oldestOpenedAt',q.oldest_at,
    'oldestAgeMinutes',CASE WHEN q.oldest_at IS NULL THEN NULL
      ELSE round(greatest(extract(epoch FROM (v_as_of-q.oldest_at)),0)::numeric/60,2) END,
    'asOf',v_as_of
  ) ORDER BY q.process_key),'[]'::jsonb)
  INTO v_queues
  FROM queue_rows q
  WHERE (q.process_key IN ('ORDERS','QUOTES') AND v_can_staff)
     OR (q.process_key='PURCHASE' AND v_can_purchase)
     OR (q.process_key='INVOICES' AND v_can_finance)
     OR (q.process_key='TASKS' AND v_task_access);

  IF v_task_access THEN
    SELECT count(*)::integer INTO v_reopened
    FROM public.audit_logs a
    WHERE a.organization_id=v_org AND a.entity_type='ai_task'
      AND a.action='operational_task.status_changed'
      AND a.old_value->>'status'='completed'
      AND a.new_value->>'status' IN ('pending','in_progress')
      AND a.created_at >= (p_from::timestamp AT TIME ZONE 'UTC')
      AND a.created_at < ((p_to+1)::timestamp AT TIME ZONE 'UTC')
      AND EXISTS (
        SELECT 1 FROM public.ai_tasks t
        WHERE t.id=a.entity_id AND t.organization_id=v_org
          AND public.can_view_operational_task_role(t.task_role)
      );
  ELSE
    v_reopened:=NULL;
  END IF;

  v_coverage:=jsonb_build_array(
    jsonb_build_object(
      'key','ORDERS','status',CASE WHEN v_can_staff THEN 'VERIFIED' ELSE 'UNAVAILABLE' END,
      'source','orders + order_status_history','asOf',CASE WHEN v_can_staff THEN v_as_of ELSE NULL END,
      'period',CASE WHEN v_can_staff THEN jsonb_build_object('from',p_from,'to',p_to,'timeZone','UTC') ELSE NULL END,
      'sampleCount',CASE WHEN v_can_staff THEN coalesce((v_counts->>'ORDERS')::integer,0) ELSE NULL END,
      'completePopulation',v_can_staff,
      'message',CASE WHEN v_can_staff THEN 'انتقالات حالة الطلبات المسجلة في سجل الحالات.' ELSE 'مصدر الطلبات غير متاح لهذا الدور.' END
    ),
    jsonb_build_object(
      'key','QUOTES','status',CASE WHEN v_can_staff THEN 'VERIFIED' ELSE 'UNAVAILABLE' END,
      'source','sales_quotes','asOf',CASE WHEN v_can_staff THEN v_as_of ELSE NULL END,
      'period',CASE WHEN v_can_staff THEN jsonb_build_object('from',p_from,'to',p_to,'timeZone','UTC') ELSE NULL END,
      'sampleCount',CASE WHEN v_can_staff THEN coalesce((v_counts->>'QUOTES')::integer,0) ELSE NULL END,
      'completePopulation',v_can_staff,
      'message',CASE WHEN v_can_staff THEN 'زمن استجابة عروض الأسعار المسجل.' ELSE 'مصدر عروض الأسعار غير متاح لهذا الدور.' END
    ),
    jsonb_build_object(
      'key','PURCHASE','status',CASE WHEN v_can_purchase THEN 'VERIFIED' ELSE 'UNAVAILABLE' END,
      'source','purchase_orders + purchase_receipts','asOf',CASE WHEN v_can_purchase THEN v_as_of ELSE NULL END,
      'period',CASE WHEN v_can_purchase THEN jsonb_build_object('from',p_from,'to',p_to,'timeZone','UTC') ELSE NULL END,
      'sampleCount',CASE WHEN v_can_purchase THEN coalesce((v_counts->>'PURCHASE')::integer,0) ELSE NULL END,
      'completePopulation',v_can_purchase,
      'message',CASE WHEN v_can_purchase THEN 'زمن مراجعة مسودة أمر الشراء وزمن الاستلام المختلط.' ELSE 'مصدر المشتريات يتطلب صلاحية إدارة الشراء.' END
    ),
    jsonb_build_object(
      'key','INVOICES','status',CASE WHEN v_can_finance THEN 'VERIFIED' ELSE 'UNAVAILABLE' END,
      'source','customer_invoices + customer_payments','asOf',CASE WHEN v_can_finance THEN v_as_of ELSE NULL END,
      'period',CASE WHEN v_can_finance THEN jsonb_build_object('from',p_from,'to',p_to,'timeZone','UTC') ELSE NULL END,
      'sampleCount',CASE WHEN v_can_finance THEN coalesce((v_counts->>'INVOICES')::integer,0) ELSE NULL END,
      'completePopulation',v_can_finance,
      'message',CASE WHEN v_can_finance THEN 'الفواتير المسددة بالكامل؛ زمن التحصيل الخارجي حتى آخر دفعة مسجلة.' ELSE 'مصدر التحصيل يتطلب صلاحية مالية.' END
    ),
    jsonb_build_object(
      'key','TASKS','status',CASE WHEN v_task_access THEN 'VERIFIED' ELSE 'UNAVAILABLE' END,
      'source','ai_tasks + audit_logs','asOf',CASE WHEN v_task_access THEN v_as_of ELSE NULL END,
      'period',CASE WHEN v_task_access THEN jsonb_build_object('from',p_from,'to',p_to,'timeZone','UTC') ELSE NULL END,
      'sampleCount',CASE WHEN v_task_access THEN coalesce((v_counts->>'TASKS')::integer,0) ELSE NULL END,
      'completePopulation',v_task_access,
      'message',CASE WHEN v_task_access THEN 'زمن إنشاء المهمة إلى أول إكمال مسجل؛ إعادة الفتح مستقلة.' ELSE 'مصدر المهام غير متاح لهذا الدور.' END
    )
  );

  v_baseline:=CASE WHEN p_baseline_from IS NULL THEN NULL
    ELSE jsonb_build_object('from',p_baseline_from,'to',p_baseline_to,'timeZone','UTC') END;

  RETURN jsonb_build_object(
    'asOf',v_as_of,
    'period',jsonb_build_object('from',p_from,'to',p_to,'timeZone','UTC'),
    'baselinePeriod',v_baseline,
    'metrics',v_metrics,
    'queues',v_queues,
    'sourceCoverage',v_coverage,
    'reopenedTasks',v_reopened
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_process_bottleneck_snapshot(date,date,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_process_bottleneck_snapshot(date,date,date,date) TO authenticated;
COMMENT ON FUNCTION public.fetch_process_bottleneck_snapshot(date,date,date,date) IS
  'Tenant-scoped process cycle-time aggregates from authoritative status timestamps; reports mixed waits as unattributed and accepts only equal-length prior comparison windows.';

COMMIT;
