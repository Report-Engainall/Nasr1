import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  orders: [] as Array<Record<string, unknown>>,
  updateResult: null as null | { data: { id: string; status: string } | null; error: { message: string } | null },
  updateCall: null as null | { table: string; payload: Record<string, unknown>; id: string },
}))

vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }))

import AdminOrders from '@/pages/admin/AdminOrders'

const makeOrder = (status = 'pending') => ({
  id: 'order-1',
  order_code: 'ORD-1',
  customer_id: 'customer-1',
  status,
  notes: null,
  admin_notes: null,
  total_amount: 120,
  total_items: 2,
  idempotency_key: 'order-key-1',
  created_at: '2026-10-22T10:00:00.000Z',
  updated_at: '2026-10-22T10:00:00.000Z',
})

function createOrderReadQuery() {
  return { order: vi.fn(async () => ({ data: mocks.orders, error: null })) }
}

function createOrderUpdateResultQuery(table: string, payload: Record<string, unknown>, id: string) {
  return {
    maybeSingle: vi.fn(async () => {
      mocks.updateCall = { table, payload, id }
      return mocks.updateResult
    }),
  }
}

function createOrderUpdateQuery(table: string, payload: Record<string, unknown>) {
  return {
    eq: vi.fn((_column: string, id: string) => ({
      select: vi.fn(() => createOrderUpdateResultQuery(table, payload, id)),
    })),
  }
}

function createOrdersTableMock(table: string) {
  return {
    select: vi.fn(createOrderReadQuery),
    update: vi.fn((payload: Record<string, unknown>) => createOrderUpdateQuery(table, payload)),
  }
}

function createCustomersTableMock() {
  return {
    select: vi.fn(async () => ({ data: [{ id: 'customer-1', full_name: 'عميل الاختبار' }], error: null })),
  }
}

function createOrderItemsTableMock() {
  return { select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })) }
}

function createTableMock(table: string) {
  if (table === 'orders') return createOrdersTableMock(table)
  if (table === 'customers') return createCustomersTableMock()
  if (table === 'order_items') return createOrderItemsTableMock()
  throw new Error('Unexpected table: ' + table)
}

describe('admin order status transition UI', () => {
  beforeEach(() => {
    mocks.orders = [makeOrder()]
    mocks.updateResult = { data: { id: 'order-1', status: 'confirmed' }, error: null }
    mocks.updateCall = null
    mocks.from.mockReset().mockImplementation(createTableMock)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('offers only database-supported next states for a pending order', async () => {
    render(<AdminOrders />)
    const select = await screen.findByRole('combobox', { name: 'حالة الطلب ORD-1' }) as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['pending', 'confirmed', 'cancelled'])
  })

  it('persists an allowed transition and updates the displayed status from the server response', async () => {
    render(<AdminOrders />)
    const select = await screen.findByRole('combobox', { name: 'حالة الطلب ORD-1' }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'confirmed' } })

    await waitFor(() => expect(select.value).toBe('confirmed'))
    expect(mocks.updateCall).toMatchObject({
      table: 'orders',
      id: 'order-1',
      payload: { status: 'confirmed' },
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('surfaces a database transition denial and does not display a false success state', async () => {
    mocks.updateResult = { data: null, error: { message: 'order transition denied' } }
    render(<AdminOrders />)
    const select = await screen.findByRole('combobox', { name: 'حالة الطلب ORD-1' }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'confirmed' } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/تعذر تغيير حالة الطلب ORD-1: order transition denied/)
    expect(select.value).toBe('pending')
  })

  it('treats an update affecting no visible row as denial instead of success', async () => {
    mocks.updateResult = { data: null, error: null }
    render(<AdminOrders />)
    const select = await screen.findByRole('combobox', { name: 'حالة الطلب ORD-1' }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'confirmed' } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/لم يُرجع الخادم سجلًا محدّثًا/)
    expect(select.value).toBe('pending')
  })

  it('rejects a status write response for a different order row', async () => {
    mocks.updateResult = { data: { id: 'other-order', status: 'confirmed' }, error: null }
    render(<AdminOrders />)
    const select = await screen.findByRole('combobox', { name: 'حالة الطلب ORD-1' }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'confirmed' } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/صفًا لا يطابق الطلب المطلوب/)
    expect(select.value).toBe('pending')
  })

  it('does not offer mutations for terminal statuses', async () => {
    mocks.orders = [makeOrder('delivered')]
    render(<AdminOrders />)
    const terminal = await screen.findByRole('combobox', { name: 'حالة الطلب ORD-1' }) as HTMLSelectElement
    expect(terminal.disabled).toBe(true)
    expect(Array.from(terminal.options).map((option) => option.value)).toEqual(['delivered'])
  })

  it('does not offer mutation controls for legacy statuses unsupported by the database workflow', async () => {
    mocks.orders = [makeOrder('new')]
    render(<AdminOrders />)
    expect(await screen.findByLabelText('حالة قديمة للطلب ORD-1')).toHaveTextContent('حالة قديمة: جديد')
    expect(screen.queryByRole('combobox', { name: 'حالة الطلب ORD-1' })).not.toBeInTheDocument()
  })
})
