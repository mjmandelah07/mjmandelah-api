import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { IsOptional, IsUUID } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { toMoney } from '../common/money';
import { pageOf, paging, PageQueryDto } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { UploadedImage } from '../uploads/uploaded-image';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { AdjustStockDto, CreateIntakeDto } from './dto/stock.dto';
import { StockService } from './stock.service';

class MovementQuery extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;
}

@Injectable()
export class StockLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async intake(actor: AuthUser, dto: CreateIntakeDto, receipt?: UploadedImage) {
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) throw new NotFoundException('Supplier not found');
    }
    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.items.map((item) => item.productId) } },
    });
    if (products.length !== new Set(dto.items.map((item) => item.productId)).size) {
      throw new BadRequestException('One or more products were not found');
    }

    let uploaded: { url: string; publicId: string; bytes: number; mimeType: string } | null = null;
    if (receipt) {
      uploaded = await this.cloudinary.uploadImage(receipt, 'intake-receipts');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const intake = await tx.stockIntake.create({
          data: {
            supplierId: dto.supplierId ?? null,
            reference: dto.reference?.trim() || null,
            notes: dto.notes?.trim() || null,
            receivedById: actor.id,
            items: {
              create: dto.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitCost: item.unitCost,
              })),
            },
          },
        });
        if (uploaded) {
          await tx.storedFile.create({
            data: {
              kind: 'INTAKE_RECEIPT',
              url: uploaded.url,
              publicId: uploaded.publicId,
              bytes: uploaded.bytes,
              mimeType: receipt?.mimetype,
              intakeId: intake.id,
            },
          });
        }
        for (const item of dto.items) {
          await this.stock.receive(tx, {
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            referenceId: intake.id,
            createdById: actor.id,
            note: dto.reference?.trim() || 'Stock intake',
          });
        }
        return tx.stockIntake.findUnique({
          where: { id: intake.id },
          include: { items: true, files: true, supplier: true },
        });
      });
    } catch (error) {
      if (uploaded) await this.cloudinary.destroy(uploaded.publicId).catch(() => undefined);
      throw error;
    }
  }

  async listIntakes(query: PageQueryDto) {
    const { page, pageSize, skip, take } = paging(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockIntake.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: true,
          files: true,
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          receivedBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.stockIntake.count(),
    ]);
    return pageOf(
      rows.map((row) => ({
        ...row,
        items: row.items.map((item) => ({ ...item, unitCost: toMoney(item.unitCost) })),
      })),
      total,
      page,
      pageSize,
    );
  }

  async movements(query: MovementQuery) {
    const { page, pageSize, skip, take } = paging(query);
    const where: Prisma.StockMovementWhereInput = query.productId
      ? { productId: query.productId }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return pageOf(rows, total, page, pageSize);
  }

  async adjust(actor: AuthUser, dto: AdjustStockDto) {
    const signed = dto.direction === 'INCREASE' ? dto.quantity : -dto.quantity;
    return this.prisma.$transaction(async (tx) => {
      const product = await this.stock.apply(tx, {
        productId: dto.productId,
        quantity: signed,
        type: StockMovementType.ADJUSTMENT,
        note: dto.reason.trim(),
        createdById: actor.id,
      });
      return {
        productId: product.id,
        quantityOnHand: product.quantityOnHand,
        direction: dto.direction,
        quantity: dto.quantity,
      };
    });
  }
}

export { MovementQuery };
