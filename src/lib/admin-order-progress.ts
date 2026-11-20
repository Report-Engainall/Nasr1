export const ADMIN_ORDER_PROGRESS_STEPS = [
  'استلام الطلب',
  'المراجعة',
  'الاعتماد',
  'التجهيز',
  'الشحن',
  'التسليم',
] as const;

export type AdminOrderProgressStep = {
  label: (typeof ADMIN_ORDER_PROGRESS_STEPS)[number];
  state: 'complete' | 'current' | 'upcoming';
};

export type AdminOrderProgress =
  | { kind: 'progress'; currentStep: number; steps: AdminOrderProgressStep[]; message: null }
  | { kind: 'returned' | 'stopped' | 'unknown'; currentStep: number | null; steps: []; message: string };

const ORDER_STATUS_STEP: Readonly<Record<string, number>> = {
  new: 0,
  draft: 0,
  pending: 1,
  received: 1,
  reviewing: 1,
  confirmed: 2,
  approved: 2,
  processing: 3,
  preparing: 3,
  prepared: 3,
  shipped: 4,
  dispatched: 4,
  delivered: 5,
  invoiced: 5,
};

const RETURNED_ORDER_STATUSES = new Set([
  'returned',
  'needs_customer_amendment',
  'returned_for_adjustment',
]);
const STOPPED_ORDER_STATUSES = new Set(['cancelled', 'rejected']);

/** Pure presentation projection. It never authorizes or changes an order transition. */
export function getAdminOrderProgress(status: string): AdminOrderProgress {
  if (RETURNED_ORDER_STATUSES.has(status)) {
    return {
      kind: 'returned',
      currentStep: 1,
      steps: [],
      message: 'أُعيد الطلب للعميل للتعديل؛ يلزم مراجعة النسخة المعدلة قبل الاعتماد.',
    };
  }
  if (STOPPED_ORDER_STATUSES.has(status)) {
    return {
      kind: 'stopped',
      currentStep: null,
      steps: [],
      message: status === 'cancelled' ? 'أُلغي الطلب وتوقفت دورة تنفيذه.' : 'رُفض الطلب وتوقفت دورة تنفيذه.',
    };
  }
  const currentStep = ORDER_STATUS_STEP[status];
  if (currentStep === undefined) {
    return {
      kind: 'unknown',
      currentStep: null,
      steps: [],
      message: 'حالة الطلب غير معروفة؛ راجع سجل الطلب قبل اتخاذ أي إجراء.',
    };
  }
  const deliveryComplete = status === 'delivered' || status === 'invoiced';
  return {
    kind: 'progress',
    currentStep,
    steps: ADMIN_ORDER_PROGRESS_STEPS.map((label, index) => ({
      label,
      state: index < currentStep || (deliveryComplete && index === currentStep)
        ? 'complete'
        : index === currentStep ? 'current' : 'upcoming',
    })),
    message: null,
  };
}
