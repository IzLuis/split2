import { describe, expect, it } from 'vitest';
import { resolveReceiptSubtotal, resolveReceiptTipPercentage } from './receipt-ocr';

describe('receipt ocr helpers', () => {
  it('uses parsed subtotal when available', () => {
    const subtotal = resolveReceiptSubtotal({
      title: 'Test',
      expenseDate: null,
      currency: 'USD',
      subtotalAmount: 24.55,
      totalAmount: 30,
      tipAmount: null,
      deliveryFee: null,
      warnings: [],
      items: [
        { name: 'A', quantity: 1, unitPrice: 12, lineTotal: 12 },
        { name: 'B', quantity: 1, unitPrice: 12, lineTotal: 12 },
      ],
    });

    expect(subtotal).toBe(24.55);
  });

  it('falls back to sum of line totals when subtotal is missing', () => {
    const subtotal = resolveReceiptSubtotal({
      title: 'Test',
      expenseDate: null,
      currency: 'USD',
      subtotalAmount: null,
      totalAmount: 30,
      tipAmount: null,
      deliveryFee: null,
      warnings: [],
      items: [
        { name: 'A', quantity: 1, unitPrice: 10, lineTotal: 10 },
        { name: 'B', quantity: 2, unitPrice: 5.5, lineTotal: 11 },
      ],
    });

    expect(subtotal).toBe(21);
  });

  it('derives tip percentage from tip and subtotal', () => {
    const tipPercentage = resolveReceiptTipPercentage({
      title: 'Test',
      expenseDate: null,
      currency: 'USD',
      subtotalAmount: 50,
      totalAmount: 58,
      tipAmount: 5,
      deliveryFee: 3,
      warnings: [],
      items: [{ name: 'A', quantity: 1, unitPrice: 50, lineTotal: 50 }],
    });

    expect(tipPercentage).toBe(10);
  });
});
