import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, SaleStatus, StockMovementType } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { money, roundMoney, toMoney } from '../common/money';
import { pageOf, paging, PageQueryDto } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { refundForQuantity } from '../sales/sale-math';
import { StockService } from '../stock/stock.service';
import { CreateReturnDto } from './dto/create-return.dto';

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  async create(actor: AuthUser, dto: CreateReturnDto) {
    const merged = new Map<string, number>();
    for (const item of dto.items) {
      merged.set(item.saleItemId, (merged.get(item.saleItemId) ?? 0) + item.quantity);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: dto.saleId },
        include: { items: true },
      });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status === SaleStatus.VOID) {
        throw new BadRequestException('A voided sale cannot be returned');
      }

      const lines = [...merged.entries()].map(([saleItemId, quantity]) => {
        const item = sale.items.find((row) => row.id === saleItemId);
        if (!item) throw new BadRequestException('A return line does not belong to this sale');
        const remaining = item.quantity - item.returnedQty;
        if (quantity > remaining) {
          throw new BadRequestException(
            `Only ${remaining} of ${item.productName} can still be returned`,
          );
        }
        const refundAmount = refundForQuantity(
          toMoney(item.unitPrice),
          quantity,
          toMoney(sale.subtotal),
          toMoney(sale.total),
        );
        return { item, quantity, refundAmount };
      });

      const refundAmount = roundMoney(lines.reduce((sum, line) => sum + line.refundAmount, 0));
      const entry = await tx.return.create({
        data: {
          saleId: sale.id,
          reason: dto.reason.trim(),
          refundAmount: money(refundAmount),
          processedById: actor.id,
          items: {
            create: lines.map((line) => ({
              saleItemId: line.item.id,
              productId: line.item.productId,
              quantity: line.quantity,
              refundAmount: money(line.refundAmount),
            })),
          },
        },
        include: { items: true },
      });

      for (const line of lines.sort((a, b) => a.item.productId.localeCompare(b.item.productId))) {
        await tx.saleItem.update({
          where: { id: line.item.id },
          data: { returnedQty: { increment: line.quantity } },
        });
        await this.stock.apply(tx, {
          productId: line.item.productId,
          quantity: line.quantity,
          type: StockMovementType.RETURN,
          referenceId: entry.id,
          createdById: actor.id,
          note: `Return ${sale.receiptNumber}`,
        });
      }

      const updatedItems = await tx.saleItem.findMany({ where: { saleId: sale.id } });
      const fullyReturned = updatedItems.every((item) => item.returnedQty >= item.quantity);
      let balanceDue = toMoney(sale.balanceDue);
      if (sale.paymentMethod === PaymentMethod.CREDIT && sale.customerId && balanceDue > 0) {
        const applied = Math.min(balanceDue, refundAmount);
        balanceDue = roundMoney(balanceDue - applied);
        const customer = await tx.customer.findUnique({ where: { id: sale.customerId } });
        if (customer) {
          const next = Math.max(0, roundMoney(toMoney(customer.balance) - applied));
          await tx.customer.update({
            where: { id: customer.id },
            data: { balance: money(next) },
          });
        }
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: fullyReturned ? SaleStatus.RETURNED : SaleStatus.PARTIAL_RETURN,
          balanceDue: money(balanceDue),
        },
      });

      return entry;
    });

    return {
      ...result,
      refundAmount: toMoney(result.refundAmount),
      items: result.items.map((item) => ({ ...item, refundAmount: toMoney(item.refundAmount) })),
    };
  }

  async list(query: PageQueryDto) {
    const { page, pageSize, skip, take } = paging(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.return.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          sale: { select: { id: true, receiptNumber: true, channel: true } },
          processedBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.return.count(),
    ]);
    return pageOf(
      rows.map((row) => ({
        ...row,
        refundAmount: toMoney(row.refundAmount),
        items: row.items.map((item) => ({ ...item, refundAmount: toMoney(item.refundAmount) })),
      })),
      total,
      page,
      pageSize,
    );
  }

  async get(id: string) {
    const row = await this.prisma.return.findUnique({
      where: { id },
      include: {
        items: true,
        sale: { select: { id: true, receiptNumber: true, channel: true } },
        processedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!row) throw new NotFoundException('Return not found');
    return {
      ...row,
      refundAmount: toMoney(row.refundAmount),
      items: row.items.map((item) => ({ ...item, refundAmount: toMoney(item.refundAmount) })),
    };
  }
}
