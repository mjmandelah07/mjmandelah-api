import PDFDocument from 'pdfkit';
import { formatMoney } from '../common/money';
import { ReceiptView } from './receipt-html';

export function renderReceiptPdf(view: ReceiptView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const money = (amount: number) => formatMoney(amount, view.currency);
    doc.fontSize(20).text(view.store.name, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10);
    if (view.store.address) doc.text(view.store.address, { align: 'center' });
    if (view.store.phone) doc.text(view.store.phone, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Receipt ${view.receiptNumber}`);
    doc.text(`Date ${view.createdAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`);
    doc.text(`Channel ${view.channel}`);
    doc.text(`Cashier ${view.cashierName}`);
    if (view.customerName) doc.text(`Customer ${view.customerName}`);
    doc.moveDown();

    view.items.forEach((item) => {
      doc.fontSize(11).text(`${item.name} (${item.sku})`);
      doc
        .fontSize(10)
        .text(
          `${item.quantity} x ${money(item.unitPrice)}    ${money(item.lineTotal)}`,
          { align: 'right' },
        );
    });

    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Subtotal ${money(view.subtotal)}`);
    doc.text(`Discount ${money(view.discount)}`);
    doc.text(`Tax ${money(view.tax)}`);
    doc.fontSize(13).text(`Total ${money(view.total)}`);
    doc.fontSize(11).text(`Paid (${view.paymentMethod}) ${money(view.amountPaid)}`);
    doc.text(`Change ${money(view.changeDue)}`);
    doc.text(`Balance ${money(view.balanceDue)}`);
    if (view.notes) {
      doc.moveDown();
      doc.text(view.notes);
    }
    doc.moveDown();
    doc.fontSize(10).text(view.store.footer || 'Thank you.', { align: 'center' });
    doc.end();
  });
}
