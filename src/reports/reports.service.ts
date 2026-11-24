import { Injectable } from '@nestjs/common';
import { SaleChannel, SaleStatus } from '@prisma/client';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
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

type Bucket = 'hour' | 'day' | 'month';

export class AnalyticsQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsIn(['hour', 'day', 'month'])
  bucket?: Bucket;
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

  async analytics(query: AnalyticsQueryDto) {
    const range = createdAtRange(query.from, query.to) ?? todayRange();
    const from = range.gte ?? new Date(0);
    const to = range.lt ?? new Date();
    const bucket = fitBucket(from, to, query.bucket);
    const saleWhere = { createdAt: { gte: from, lt: to }, status: { not: SaleStatus.VOID } };

    const [seriesRows, payments, popular, units, best, cashiers] = await Promise.all([
      this.prisma.$queryRaw<Array<{ bucket: Date; channel: string; count: number; total: string }>>`
        SELECT (date_trunc(${bucket}, "createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS bucket,
               "channel"::text AS channel,
               COUNT(*)::int AS count,
               COALESCE(SUM("total"), 0)::text AS total
        FROM "Sale"
        WHERE "createdAt" >= ${from}
          AND "createdAt" < ${to}
          AND "status"::text <> 'VOID'
        GROUP BY 1, 2
        ORDER BY 1
      `,
      this.prisma.sale.groupBy({
        by: ['paymentMethod'],
        where: saleWhere,
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.$queryRaw<
        Array<{ productId: string; name: string; sku: string; quantity: number; total: string }>
      >`
        SELECT si."productId" AS "productId",
               si."productName" AS name,
               si."sku" AS sku,
               SUM(si."quantity")::int AS quantity,
               COALESCE(SUM(si."lineTotal"), 0)::text AS total
        FROM "SaleItem" si
        JOIN "Sale" s ON s."id" = si."saleId"
        WHERE s."createdAt" >= ${from}
          AND s."createdAt" < ${to}
          AND s."status"::text <> 'VOID'
        GROUP BY si."productId", si."productName", si."sku"
        ORDER BY SUM(si."quantity") DESC, SUM(si."lineTotal") DESC
        LIMIT 8
      `,
      this.prisma.$queryRaw<Array<{ quantity: number }>>`
        SELECT COALESCE(SUM(si."quantity"), 0)::int AS quantity
        FROM "SaleItem" si
        JOIN "Sale" s ON s."id" = si."saleId"
        WHERE s."createdAt" >= ${from}
          AND s."createdAt" < ${to}
          AND s."status"::text <> 'VOID'
      `,
      this.prisma.sale.findMany({
        where: saleWhere,
        orderBy: { total: 'desc' },
        take: 5,
        select: {
          id: true,
          receiptNumber: true,
          channel: true,
          paymentMethod: true,
          total: true,
          createdAt: true,
          cashier: { select: { fullName: true } },
        },
      }),
      this.prisma.$queryRaw<Array<{ id: string; fullName: string; count: number; total: string }>>`
        SELECT u."id" AS id,
               u."fullName" AS "fullName",
               COUNT(*)::int AS count,
               COALESCE(SUM(s."total"), 0)::text AS total
        FROM "Sale" s
        JOIN "User" u ON u."id" = s."cashierId"
        WHERE s."createdAt" >= ${from}
          AND s."createdAt" < ${to}
          AND s."status"::text <> 'VOID'
        GROUP BY u."id", u."fullName"
        ORDER BY SUM(s."total") DESC
        LIMIT 8
      `,
    ]);

    const series = emptyBuckets(from, to, bucket).map((point) => {
      const rows = seriesRows.filter((row) => sameBucket(row.bucket, point, bucket));
      const retail = rows.find((row) => row.channel === SaleChannel.RETAIL);
      const wholesale = rows.find((row) => row.channel === SaleChannel.WHOLESALE);
      return {
        bucket: point.toISOString(),
        retail: toMoney(retail?.total ?? 0),
        wholesale: toMoney(wholesale?.total ?? 0),
        count: rows.reduce((sum, row) => sum + Number(row.count), 0),
      };
    });

    const retailTotal = roundMoney(series.reduce((sum, point) => sum + point.retail, 0));
    const wholesaleTotal = roundMoney(series.reduce((sum, point) => sum + point.wholesale, 0));
    const salesCount = series.reduce((sum, point) => sum + point.count, 0);

    return {
      from,
      to,
      bucket,
      salesCount,
      retailTotal,
      wholesaleTotal,
      total: roundMoney(retailTotal + wholesaleTotal),
      averageSale: salesCount ? roundMoney((retailTotal + wholesaleTotal) / salesCount) : 0,
      unitsSold: Number(units[0]?.quantity ?? 0),
      series,
      payments: payments.map((row) => ({
        method: row.paymentMethod,
        count: row._count,
        total: toMoney(row._sum.total ?? 0),
      })),
      popularProducts: popular.map((row) => ({
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        quantity: Number(row.quantity),
        total: toMoney(row.total),
      })),
      bestSales: best.map((sale) => ({ ...sale, total: toMoney(sale.total) })),
      cashiers: cashiers.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        count: Number(row.count),
        total: toMoney(row.total),
      })),
    };
  }
}

function fitBucket(from: Date, to: Date, requested?: Bucket): Bucket {
  const hours = Math.max(0, (to.getTime() - from.getTime()) / 3_600_000);
  let bucket: Bucket = requested ?? (hours <= 48 ? 'hour' : hours <= 62 * 24 ? 'day' : 'month');
  if (bucket === 'hour' && hours > 72) bucket = 'day';
  if (bucket === 'day' && hours > 120 * 24) bucket = 'month';
  return bucket;
}

function sameBucket(value: Date, point: Date, bucket: Bucket) {
  const left = new Date(value);
  if (bucket === 'month') return left.getUTCFullYear() === point.getUTCFullYear() && left.getUTCMonth() === point.getUTCMonth();
  if (bucket === 'day') return left.toISOString().slice(0, 10) === point.toISOString().slice(0, 10);
  return left.toISOString().slice(0, 13) === point.toISOString().slice(0, 13);
}

function emptyBuckets(from: Date, to: Date, bucket: Bucket) {
  const points: Date[] = [];
  let cursor = alignBucket(from, bucket);
  while (cursor < to && points.length < 400) {
    points.push(cursor);
    cursor = nextBucket(cursor, bucket);
  }
  return points;
}

function alignBucket(date: Date, bucket: Bucket) {
  if (bucket === 'month') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  if (bucket === 'day') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()));
}

function nextBucket(date: Date, bucket: Bucket) {
  const next = new Date(date);
  if (bucket === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
  else if (bucket === 'day') next.setUTCDate(next.getUTCDate() + 1);
  else next.setUTCHours(next.getUTCHours() + 1);
  return next;
}
