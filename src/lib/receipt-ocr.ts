export type ReceiptOcrItem = {
  name: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number;
};

export type ReceiptOcrResult = {
  title: string;
  expenseDate: string | null;
  currency: string | null;
  subtotalAmount: number | null;
  totalAmount: number | null;
  tipAmount: number | null;
  deliveryFee: number | null;
  warnings: string[];
  items: ReceiptOcrItem[];
};

function roundCurrency(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function toMoneyInputString(amount: number | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '';
  }

  return roundCurrency(amount).toFixed(2);
}

export function toPercentString(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }

  return value.toFixed(3).replace(/\.?0+$/, '');
}

export function resolveReceiptSubtotal(receipt: ReceiptOcrResult) {
  if (
    typeof receipt.subtotalAmount === 'number' &&
    Number.isFinite(receipt.subtotalAmount) &&
    receipt.subtotalAmount > 0
  ) {
    return roundCurrency(receipt.subtotalAmount);
  }

  return roundCurrency(receipt.items.reduce((sum, item) => sum + item.lineTotal, 0));
}

export function resolveReceiptTipPercentage(receipt: ReceiptOcrResult) {
  if (
    typeof receipt.tipAmount !== 'number' ||
    !Number.isFinite(receipt.tipAmount) ||
    receipt.tipAmount <= 0
  ) {
    return null;
  }

  const subtotal = resolveReceiptSubtotal(receipt);
  if (subtotal <= 0) {
    return null;
  }

  return (receipt.tipAmount / subtotal) * 100;
}
