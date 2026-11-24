import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { money, roundMoney } from '../common/money';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export type LockedProduct = {
  id: string;
  name: string;
  sku: string;
  quantityOnHand: number;
  reorderLevel: number;
  costPrice: string;
  isActive: boolean;
};

type MovementInput = {
  productId: string;
  quantity: number;
  type: StockMovementType;
  note?: string;
  referenceId?: string;
  createdById?: string;
};

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async lock(tx: Prisma.TransactionClient, productId: string): Promise<LockedProduct> {
    const rows = await tx.$queryRaw<LockedProduct[]>`
      SELECT
        "id",
        "name",
        "sku",
        "quantityOnHand",
        "reorderLevel",
        "costPrice"::text AS "costPrice",
        "isActive"
      FROM "Product"
      WHERE "id" = ${productId}
      FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Product not found');
    return rows[0];
  }

  async apply(tx: Prisma.TransactionClient, change: MovementInput) {
    if (!Number.isInteger(change.quantity) || change.quantity === 0) {
      throw new BadRequestException('Stock quantity must be a non-zero whole number');
    }
    const row = await this.lock(tx, change.productId);
    const next = row.quantityOnHand + change.quantity;
    if (next < 0) {
      throw new BadRequestException(
        `Not enough stock for ${row.name}. On hand: ${row.quantityOnHand}`,
      );
    }
    await tx.product.update({
      where: { id: change.productId },
      data: { quantityOnHand: next },
    });
    await tx.stockMovement.create({
      data: {
        productId: change.productId,
        type: change.type,
        quantity: change.quantity,
        balanceAfter: next,
        note: change.note,
        referenceId: change.referenceId,
        createdById: change.createdById,
      },
    });
    await this.notifications.syncLowStock(tx, {
      id: row.id,
      name: row.name,
      sku: row.sku,
      quantityOnHand: next,
      reorderLevel: row.reorderLevel,
    });
    return { ...row, quantityOnHand: next };
  }

  async receive(
    tx: Prisma.TransactionClient,
    input: {
      productId: string;
      quantity: number;
      unitCost: number;
      referenceId?: string;
      createdById?: string;
      note?: string;
    },
  ) {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new BadRequestException('Received quantity must be at least 1');
    }
    const row = await this.lock(tx, input.productId);
    const next = row.quantityOnHand + input.quantity;
    const oldCost = Number(row.costPrice);
    const newCost = roundMoney(
      (row.quantityOnHand * oldCost + input.quantity * input.unitCost) / next,
    );
    await tx.product.update({
      where: { id: input.productId },
      data: { quantityOnHand: next, costPrice: money(newCost) },
    });
    await tx.stockMovement.create({
      data: {
        productId: input.productId,
        type: StockMovementType.INTAKE,
        quantity: input.quantity,
        balanceAfter: next,
        note: input.note,
        referenceId: input.referenceId,
        createdById: input.createdById,
      },
    });
    await this.notifications.syncLowStock(tx, {
      id: row.id,
      name: row.name,
      sku: row.sku,
      quantityOnHand: next,
      reorderLevel: row.reorderLevel,
    });
    return { balance: next, costPrice: newCost };
  }
}
