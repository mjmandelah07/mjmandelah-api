import { calculateSaleTotals, refundForQuantity } from './sale-math';

describe('sale math', () => {
  it('applies discount and tax on the discounted subtotal', () => {
    const totals = calculateSaleTotals(
      [
        { unitPrice: 100, quantity: 2 },
        { unitPrice: 50.5, quantity: 1 },
      ],
      10,
      7.5,
    );
    expect(totals.subtotal).toBe(250.5);
    expect(totals.discount).toBe(10);
    expect(totals.tax).toBe(18.04);
    expect(totals.total).toBe(258.54);
  });

  it('rejects a discount larger than the subtotal', () => {
    expect(() => calculateSaleTotals([{ unitPrice: 20, quantity: 1 }], 21, 0)).toThrow(
      /discount/i,
    );
  });

  it('scales a return by what the customer actually paid', () => {
    expect(refundForQuantity(25, 2, 100, 90)).toBe(45);
  });
});
