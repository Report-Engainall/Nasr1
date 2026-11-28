import { describe, expect, it } from 'vitest';
import { getAdminOrderProgress } from './admin-order-progress';

describe('admin order progress presentation', () => {
  it('projects a new order at receipt and a submitted pending order at review', () => {
    const created = getAdminOrderProgress('new');
    expect(created.kind).toBe('progress');
    if (created.kind !== 'progress') return;
    expect(created.currentStep).toBe(0);
    expect(created.steps.map((step) => step.state)).toEqual([
      'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming',
    ]);

    const submitted = getAdminOrderProgress('pending');
    expect(submitted.kind).toBe('progress');
    if (submitted.kind !== 'progress') return;
    expect(submitted.currentStep).toBe(1);
    expect(submitted.steps.map((step) => step.state)).toEqual([
      'complete', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming',
    ]);
  });

  it('marks only earlier stages complete for a processing order', () => {
    const result = getAdminOrderProgress('processing');
    expect(result.kind).toBe('progress');
    if (result.kind !== 'progress') return;
    expect(result.steps.map((step) => step.state)).toEqual([
      'complete', 'complete', 'complete', 'current', 'upcoming', 'upcoming',
    ]);
  });

  it('shows delivery as the terminal completed stage', () => {
    const result = getAdminOrderProgress('delivered');
    expect(result.kind).toBe('progress');
    if (result.kind !== 'progress') return;
    expect(result.steps.every((step) => step.state === 'complete')).toBe(true);
  });

  it('does not falsely show a normal forward progress track after returning to the customer', () => {
    for (const status of ['returned', 'needs_customer_amendment', 'returned_for_adjustment']) {
      const result = getAdminOrderProgress(status);
      expect(result.kind).toBe('returned');
      expect(result.steps).toEqual([]);
      expect(result.message).toContain('أُعيد الطلب للعميل');
    }
  });

  it('marks cancelled and rejected orders as stopped, not completed', () => {
    for (const status of ['cancelled', 'rejected']) {
      const result = getAdminOrderProgress(status);
      expect(result.kind).toBe('stopped');
      expect(result.steps).toEqual([]);
      expect(result.message).toContain('توقفت');
    }
  });

  it('fails closed for an unrecognized status', () => {
    expect(getAdminOrderProgress('unexpected_state')).toMatchObject({
      kind: 'unknown',
      currentStep: null,
      steps: [],
    });
  });
});
