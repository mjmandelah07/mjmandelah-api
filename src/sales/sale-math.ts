import { roundMoney } from '../common/money';

export type SaleLineInput = {
  unitPrice: number;
  quantity: number;
};

export type SaleTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
};

export function calculateSaleTotals(
  lines: SaleLineInput[],
  discount: number,
  taxRate: number,
): SaleTotals {
  if (!lines.length) throw new Error('Add at least one product');
  if (!Number.isFinite(discount) || discount < 0) {
    throw new Error('Discount must be zero or greater');
  }
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    throw new Error('Tax rate must be between 0 and 100');
  }

  let subtotal = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error('Quantity must be a whole number of at least 1');
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw new Error('Price must be zero or greater');
    }
    subtotal = roundMoney(subtotal + roundMoney(line.unitPrice * line.quantity));
  }

  if (discount > subtotal) {
    throw new Error('Discount cannot be greater than the subtotal');
  }

  const discounted = roundMoney(subtotal - discount);
  const tax = roundMoney((discounted * taxRate) / 100);
  return {
    subtotal,
    discount: roundMoney(discount),
    tax,
    total: roundMoney(discounted + tax),
  };
}

export function refundForQuantity(
  unitPrice: number,
  quantity: number,
  subtotal: number,
  total: number,
): number {
  if (subtotal <= 0) return 0;
  return roundMoney(unitPrice * quantity * (total / subtotal));
}
