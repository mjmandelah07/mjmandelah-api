import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { PaymentMethod, Prisma, SaleChannel, SaleStatus, StockMovementType } from '@prisma/client';
import { createdAtRange } from '../common/dates';
import { AuthUser } from '../common/auth-user';
import { money, roundMoney, toMoney } from '../common/money';
import { pageOf, paging } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { receiptExpires } from '../auth/jwt.strategy';
import { QueueService } from '../queue/queue.service';
import { StockService } from '../stock/stock.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleQueryDto, saleWhere } from './dto/sale-query.dto';
import { presentSale, saleInclude } from './present-sale';
import { calculateSaleTotals } from './sale-math';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly queue: QueueService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async create(actor: AuthUser, dto: CreateSaleDto) {
    const merged = this.mergeItems(dto.items);
    const discount = dto.discount ?? 0;
    const taxRate = dto.taxRate ?? 0;
    const products = await this.prisma.product.findMany({
      where: { id: { in: merged.map((item) => item.productId) } },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    const priced = merged.map((item) => {
      const product = byId.get(item.productId);
      if (!product || !product.isActive) {
        throw new BadRequestException('One or more products are unavailable');
      }
      if (dto.channel === SaleChannel.WHOLESALE && item.quantity < product.wholesaleMinQty) {
        throw new BadRequestException(
          `${product.name} wholesale minimum is ${product.wholesaleMinQty} ${product.unit}`,
        );
      }
      const unitPrice =
        dto.channel === SaleChannel.WHOLESALE
          ? toMoney(product.wholesalePrice)
          : toMoney(product.retailPrice);
      return { product, quantity: item.quantity, unitPrice };
    });

    let totals;
    try {
      totals = calculateSaleTotals(
        priced.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
        discount,
        taxRate,
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid sale');
    }

    const payment = this.payment(dto, totals.total);
    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (!customer?.isActive) throw new NotFoundException('Customer not found');
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      const receiptNumber = await this.nextReceiptNumber(tx);
      const customer = dto.customerId
        ? await tx.customer.findUnique({ where: { id: dto.customerId } })
        : null;
      const created = await tx.sale.create({
        data: {
          receiptNumber,
          channel: dto.channel,
          paymentMethod: dto.paymentMethod,
          customerId: dto.customerId ?? null,
          customerName: dto.customerName?.trim() || customer?.name || null,
          cashierId: actor.id,
          subtotal: money(totals.subtotal),
          discount: money(totals.discount),
          taxRate: money(taxRate),
          tax: money(totals.tax),
          total: money(totals.total),
          amountPaid: money(payment.amountPaid),
          changeDue: money(payment.changeDue),
          balanceDue: money(payment.balanceDue),
          notes: dto.notes?.trim() || null,
          items: {
            create: priced.map((line) => ({
              productId: line.product.id,
              productName: line.product.name,
              sku: line.product.sku,
              quantity: line.quantity,
              unitPrice: money(line.unitPrice),
              lineTotal: money(roundMoney(line.unitPrice * line.quantity)),
            })),
          },
        },
      });

      const ordered = [...priced].sort((a, b) => a.product.id.localeCompare(b.product.id));
      for (const line of ordered) {
        await this.stock.apply(tx, {
          productId: line.product.id,
          quantity: -line.quantity,
          type: StockMovementType.SALE,
          referenceId: created.id,
          createdById: actor.id,
          note: receiptNumber,
        });
      }

      if (payment.balanceDue > 0 && dto.customerId) {
        await tx.customer.update({
          where: { id: dto.customerId },
          data: { balance: { increment: money(payment.balanceDue) } },
        });
      }

      return tx.sale.findUniqueOrThrow({ where: { id: created.id }, include: saleInclude });
    });

    await this.queue.enqueue('receipt.archive', { saleId: sale.id });
    const token = await this.receiptToken(sale.id, actor.id);
    return {
      sale: presentSale(sale),
      receipt: {
        number: sale.receiptNumber,
        printUrl: `/api/sales/${sale.id}/receipt/print?token=${token}`,
        pdfUrl: `/api/sales/${sale.id}/receipt.pdf?token=${token}`,
        jsonUrl: `/api/sales/${sale.id}/receipt?token=${token}`,
      },
    };
  }

  async list(query: SaleQueryDto) {
    const { page, pageSize, skip, take } = paging(query);
    const createdAt = createdAtRange(query.from, query.to);
    const where = { ...saleWhere(query), ...(createdAt ? { createdAt } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: saleInclude,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return pageOf(rows.map(presentSale), total, page, pageSize);
  }

  async get(id: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: saleInclude });
    if (!sale) throw new NotFoundException('Sale not found');
    return presentSale(sale);
  }

  async voidSale(actor: AuthUser, id: string) {
    const sale = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({ where: { id }, include: { items: true } });
      if (!existing) throw new NotFoundException('Sale not found');
      if (existing.status !== SaleStatus.COMPLETED) {
        throw new BadRequestException('Only a completed sale with no returns can be voided');
      }
      if (existing.items.some((item) => item.returnedQty > 0)) {
        throw new BadRequestException('This sale already has returns');
      }
      for (const item of [...existing.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
        await this.stock.apply(tx, {
          productId: item.productId,
          quantity: item.quantity,
          type: StockMovementType.VOID,
          referenceId: existing.id,
          createdById: actor.id,
          note: `Void ${existing.receiptNumber}`,
        });
      }
      if (toMoney(existing.balanceDue) > 0 && existing.customerId) {
        const customer = await tx.customer.findUnique({ where: { id: existing.customerId } });
        if (customer) {
          const next = Math.max(0, roundMoney(toMoney(customer.balance) - toMoney(existing.balanceDue)));
          await tx.customer.update({
            where: { id: customer.id },
            data: { balance: money(next) },
          });
        }
      }
      return tx.sale.update({
        where: { id },
        data: { status: SaleStatus.VOID, balanceDue: money(0) },
        include: saleInclude,
      });
    });
    return presentSale(sale);
  }

  async receiptToken(saleId: string, userId: string) {
    return this.jwt.signAsync(
      { purpose: 'receipt', saleId, sub: userId },
      { expiresIn: receiptExpires(this.config) as JwtSignOptions['expiresIn'] },
    );
  }

  private payment(dto: CreateSaleDto, total: number) {
    if (dto.paymentMethod === PaymentMethod.CREDIT) {
      if (dto.channel !== SaleChannel.WHOLESALE) {
        throw new BadRequestException('Credit is only available for wholesale sales');
      }
      if (!dto.customerId) {
        throw new BadRequestException('Choose a customer for a credit sale');
      }
      const amountPaid = dto.amountPaid ?? 0;
      if (amountPaid > total) {
        throw new BadRequestException('Amount paid cannot be more than the total');
      }
      return { amountPaid, changeDue: 0, balanceDue: roundMoney(total - amountPaid) };
    }
    const amountPaid = dto.amountPaid ?? total;
    if (amountPaid < total) {
      throw new BadRequestException('Amount paid is less than the total');
    }
    return { amountPaid, changeDue: roundMoney(amountPaid - total), balanceDue: 0 };
  }

  private mergeItems(items: CreateSaleDto['items']) {
    const merged = new Map<string, number>();
    for (const item of items) {
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    }
    return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  }

  private async nextReceiptNumber(tx: Prisma.TransactionClient) {
    const dateKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const row = await tx.dailySequence.upsert({
      where: { dateKey },
      create: { dateKey, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `RCP-${dateKey}-${String(row.value).padStart(4, '0')}`;
  }
}
