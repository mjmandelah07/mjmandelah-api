import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageOf, paging, PageQueryDto } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';

type StockSnapshot = {
  id: string;
  name: string;
  sku: string;
  quantityOnHand: number;
  reorderLevel: number;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async syncLowStock(tx: Prisma.TransactionClient, product: StockSnapshot) {
    if (product.reorderLevel <= 0) return;
    if (product.quantityOnHand > product.reorderLevel) {
      await tx.notification.updateMany({
        where: { productId: product.id, type: 'LOW_STOCK', isRead: false },
        data: { isRead: true },
      });
      return;
    }
    const existing = await tx.notification.findFirst({
      where: { productId: product.id, type: 'LOW_STOCK', isRead: false },
    });
    if (existing) return;
    await tx.notification.create({
      data: {
        type: 'LOW_STOCK',
        title: 'Low stock',
        message: `${product.name} (${product.sku}) has ${product.quantityOnHand} left. Reorder level is ${product.reorderLevel}.`,
        productId: product.id,
      },
    });
  }

  async list(query: PageQueryDto & { unreadOnly?: boolean }) {
    const { page, pageSize, skip, take } = paging(query);
    const where = query.unreadOnly ? { isRead: false } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return pageOf(rows, total, page, pageSize);
  }

  async markRead(id: string) {
    await this.prisma.notification.update({ where: { id }, data: { isRead: true } });
    return { updated: true };
  }

  async markAllRead() {
    await this.prisma.notification.updateMany({ where: { isRead: false }, data: { isRead: true } });
    return { updated: true };
  }
}
