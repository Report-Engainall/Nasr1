import { describe, expect, it } from 'vitest'
import { getOrderStatusBadgeClass } from '../lib/order-status-presentation'

describe('getOrderStatusBadgeClass', () => {
  it.each([
    ['delivered', 'badge-success'],
    ['approved', 'badge-success'],
    ['invoiced', 'badge-success'],
    ['cancelled', 'badge-error'],
    ['rejected', 'badge-error'],
    ['returned', 'badge-warning'],
    ['pending', 'badge-info'],
    ['unknown-status', 'badge-info'],
  ])('maps %s to its existing presentation class', (status, expectedClass) => {
    expect(getOrderStatusBadgeClass(status)).toBe(expectedClass)
  })
})
