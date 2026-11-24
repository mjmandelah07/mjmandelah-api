import { Prisma, Sale, SaleItem } from '@prisma/client';
import { toMoney } from '../common/money';

const saleInclude = {
  items: true,
  cashier: { select: { id: true, fullName: true } },
  customer: { select: { id: true, name: true, phone: true } },
  returns: {
    include: { items: true, processedBy: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.SaleInclude;

export type SaleRecord = Sale & {
  items: SaleItem[];
  cashier: { id: string; fullName: string };
  customer: { id: string; name: string; phone: string | null } | null;
  returns?: Array<{
    id: string;
    reason: string;
    refundAmount: Prisma.Decimal;
    createdAt: Date;
    processedBy: { id: string; fullName: string };
    items: Array<{
      id: string;
      saleItemId: string;
      productId: string;
      quantity: number;
      refundAmount: Prisma.Decimal;
    }>;
  }>;
};

export function presentSale(sale: SaleRecord) {
  return {
    id: sale.id,
    receiptNumber: sale.receiptNumber,
    channel: sale.channel,
    status: sale.status,
    paymentMethod: sale.paymentMethod,
    customerId: sale.customerId,
    customerName: sale.customerName,
    customer: sale.customer,
    cashier: sale.cashier,
    subtotal: toMoney(sale.subtotal),
    discount: toMoney(sale.discount),
    taxRate: toMoney(sale.taxRate),
    tax: toMoney(sale.tax),
    total: toMoney(sale.total),
    amountPaid: toMoney(sale.amountPaid),
    changeDue: toMoney(sale.changeDue),
    balanceDue: toMoney(sale.balanceDue),
    notes: sale.notes,
    receiptPdfUrl: sale.receiptPdfUrl,
    receiptStatus: sale.receiptStatus,
    createdAt: sale.createdAt,
    items: sale.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      returnedQty: item.returnedQty,
      remainingQty: item.quantity - item.returnedQty,
      unitPrice: toMoney(item.unitPrice),
      lineTotal: toMoney(item.lineTotal),
    })),
    returns: (sale.returns ?? []).map((entry) => ({
      id: entry.id,
      reason: entry.reason,
      refundAmount: toMoney(entry.refundAmount),
      createdAt: entry.createdAt,
      processedBy: entry.processedBy,
      items: entry.items.map((item) => ({
        ...item,
        refundAmount: toMoney(item.refundAmount),
      })),
    })),
  };
}

export { saleInclude };
