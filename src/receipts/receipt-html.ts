import { formatMoney } from '../common/money';

export type ReceiptView = {
  id: string;
  receiptNumber: string;
  channel: string;
  status: string;
  paymentMethod: string;
  customerName: string | null;
  cashierName: string;
  createdAt: Date;
  currency: string;
  store: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    footer: string | null;
  };
  items: Array<{
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  amountPaid: number;
  changeDue: number;
  balanceDue: number;
  notes: string | null;
};

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderReceiptHtml(view: ReceiptView, autoprint: boolean) {
  const money = (amount: number) => esc(formatMoney(amount, view.currency));
  const rows = view.items
    .map(
      (item) => `<tr>
        <td>${esc(item.name)}<br/><small>${esc(item.sku)}</small></td>
        <td class="right">${item.quantity}</td>
        <td class="right">${money(item.unitPrice)}</td>
        <td class="right">${money(item.lineTotal)}</td>
      </tr>`,
    )
    .join('');
  const when = esc(view.createdAt.toISOString().replace('T', ' ').slice(0, 16));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(view.receiptNumber)}</title>
  <style>
    body { font-family: sans-serif; width: 80mm; margin: 12px auto; color: #111; }
    h1 { font-size: 18px; margin: 0; text-align: center; }
    p { margin: 4px 0; font-size: 12px; text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    td { padding: 4px 0; vertical-align: top; }
    .right { text-align: right; }
    .totals { margin-top: 8px; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; }
    button { margin: 12px 0; }
    @media print { .no-print { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <button class="no-print" onclick="window.print()">Print</button>
  <h1>${esc(view.store.name)}</h1>
  ${view.store.address ? `<p>${esc(view.store.address)}</p>` : ''}
  ${view.store.phone ? `<p>${esc(view.store.phone)}</p>` : ''}
  <p>${esc(view.receiptNumber)} · ${esc(view.channel)} · ${when}</p>
  <p>Cashier: ${esc(view.cashierName)}</p>
  ${view.customerName ? `<p>Customer: ${esc(view.customerName)}</p>` : ''}
  <table>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${money(view.subtotal)}</span></div>
    <div><span>Discount</span><span>${money(view.discount)}</span></div>
    <div><span>Tax (${view.taxRate}%)</span><span>${money(view.tax)}</span></div>
    <div><strong>Total</strong><strong>${money(view.total)}</strong></div>
    <div><span>Paid (${esc(view.paymentMethod)})</span><span>${money(view.amountPaid)}</span></div>
    <div><span>Change</span><span>${money(view.changeDue)}</span></div>
    <div><span>Balance</span><span>${money(view.balanceDue)}</span></div>
  </div>
  ${view.notes ? `<p>${esc(view.notes)}</p>` : ''}
  <p>${esc(view.store.footer || 'Thank you.')}</p>
  ${autoprint ? '<script>window.print()</script>' : ''}
</body>
</html>`;
}
