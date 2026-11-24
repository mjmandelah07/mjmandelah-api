import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { toMoney } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptView } from './receipt-html';
import { renderReceiptHtml } from './receipt-html';
import { renderReceiptPdf } from './receipt-pdf';

type TokenPayload = {
  sub?: string;
  purpose?: string;
  saleId?: string;
};

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async authorize(saleId: string, authorization?: string, token?: string) {
    const raw = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : token;
    if (!raw) throw new UnauthorizedException();
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(raw);
    } catch {
      throw new UnauthorizedException('This receipt link has expired. Sign in again.');
    }
    if (payload.purpose === 'receipt') {
      if (payload.saleId !== saleId) throw new UnauthorizedException();
      return;
    }
    if (!payload.sub) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.isActive) throw new UnauthorizedException();
  }

  async view(saleId: string): Promise<ReceiptView> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
        cashier: { select: { fullName: true } },
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    const store = await this.prisma.storeProfile.findUnique({ where: { id: 1 } });
    return {
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      channel: sale.channel,
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      customerName: sale.customerName,
      cashierName: sale.cashier.fullName,
      createdAt: sale.createdAt,
      currency: store?.currency || 'NGN',
      store: {
        name: store?.name || 'Mjmandelah Store',
        address: store?.address || null,
        phone: store?.phone || null,
        email: store?.email || null,
        footer: store?.receiptFooter || 'Thank you.',
      },
      items: sale.items.map((item) => ({
        name: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: toMoney(item.unitPrice),
        lineTotal: toMoney(item.lineTotal),
      })),
      subtotal: toMoney(sale.subtotal),
      discount: toMoney(sale.discount),
      taxRate: toMoney(sale.taxRate),
      tax: toMoney(sale.tax),
      total: toMoney(sale.total),
      amountPaid: toMoney(sale.amountPaid),
      changeDue: toMoney(sale.changeDue),
      balanceDue: toMoney(sale.balanceDue),
      notes: sale.notes,
    };
  }

  async html(saleId: string, autoprint: boolean) {
    return renderReceiptHtml(await this.view(saleId), autoprint);
  }

  async pdf(saleId: string) {
    const view = await this.view(saleId);
    return { filename: `${view.receiptNumber}.pdf`, buffer: await renderReceiptPdf(view) };
  }
}
