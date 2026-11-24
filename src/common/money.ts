import { Prisma } from '@prisma/client';

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toMoney(value: Prisma.Decimal | number | string): number {
  return roundMoney(Number(value.toString()));
}

export function money(value: number): Prisma.Decimal {
  return new Prisma.Decimal(roundMoney(value).toFixed(2));
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
