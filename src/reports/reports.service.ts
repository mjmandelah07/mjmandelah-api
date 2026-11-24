import { Injectable } from '@nestjs/common';
import { SaleChannel, SaleStatus } from '@prisma/client';
import { IsDateString, IsOptional } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { createdAtRange, todayRange } from '../common/dates';
import { roundMoney, toMoney } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';

export class ReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: ReportQueryDto) {
    const range = createdAtRange(query.from, query.to) ?? todayRange();
    const saleWhere = { createdAt: range, status: { not: SaleStatus.VOID } };
    const [grouped, returns, damages, products, recent] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ['channel'],
        where: saleWhere,
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.return.aggregate({
        where: { createdAt: range },
        _sum: { refundAmount: true },
        _count: true,
      }),
      this.prisma.damageReport.aggregate({
        where: { createdAt: range },
        _sum: { quantity: true },
        _count: true,
      }),
      this.prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          quantityOnHand: true,
          reorderLevel: true,
          costPrice: true,
          retailPrice: true,
        },
      }),
      this.prisma.sale.findMany({
        where: saleWhere,
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          receiptNumber: true,
          channel: true,
          total: true,
          createdAt: true,
          cashier: { select: { fullName: true } },
        },
      }),
    ]);

    const channelTotal = (channel: SaleChannel) =>
      toMoney(grouped.find((row) => row.channel === channel)?._sum.total ?? 0);
    const salesCount = grouped.reduce((sum, row) => sum + row._count, 0);
    const lowStock = products
      .filter((product) => product.reorderLevel > 0 && product.quantityOnHand <= product.reorderLevel)
      .map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        quantityOnHand: product.quantityOnHand,
        reorderLevel: product.reorderLevel,
      }));

    let stockCost = 0;
    let stockRetail = 0;
    for (const product of products) {
      stockCost = roundMoney(stockCost + product.quantityOnHand * toMoney(product.costPrice));
      stockRetail = roundMoney(stockRetail + product.quantityOnHand * toMoney(product.retailPrice));
    }

    return {
      from: range.gte,
      to: range.lt,
      salesCount,
      retailTotal: channelTotal(SaleChannel.RETAIL),
      wholesaleTotal: channelTotal(SaleChannel.WHOLESALE),
      returnsCount: returns._count,
      returnsTotal: toMoney(returns._sum.refundAmount ?? 0),
      damageCount: damages._count,
      damagedUnits: damages._sum.quantity ?? 0,
      stockCostValue: stockCost,
      stockRetailValue: stockRetail,
      lowStock,
      recentSales: recent.map((sale) => ({
        ...sale,
        total: toMoney(sale.total),
      })),
    };
  }

  async mine(actor: AuthUser) {
    const range = todayRange();
    const where = {
      cashierId: actor.id,
      createdAt: range,
      status: { not: SaleStatus.VOID },
    };
    const [count, sum] = await this.prisma.$transaction([
      this.prisma.sale.count({ where }),
      this.prisma.sale.aggregate({ where, _sum: { total: true } }),
    ]);
    return {
      from: range.gte,
      to: range.lt,
      salesCount: count,
      total: toMoney(sum._sum.total ?? 0),
    };
  }
}
