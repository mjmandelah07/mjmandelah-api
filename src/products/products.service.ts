import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FileKind, Prisma, Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { money } from '../common/money';
import { pageOf, paging } from '../common/page';
import { rethrowKnownPrisma } from '../common/prisma-error';
import { makeSku } from '../common/slug';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { UploadedImage } from '../uploads/uploaded-image';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { presentProduct, productInclude } from './present-product';

type Asset = { url: string; publicId: string; bytes: number; mimeType: string };

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(
    actor: AuthUser,
    dto: CreateProductDto,
    images: UploadedImage[] = [],
    receipt?: UploadedImage,
  ) {
    const opening = dto.openingQuantity ?? 0;
    if (receipt && opening < 1) {
      throw new BadRequestException('Add the received quantity when you attach a receipt');
    }
    await this.ensureCategory(dto.categoryId);
    const uploadedPhotos: Asset[] = [];
    let uploadedReceipt: Asset | null = null;
    try {
      for (const image of images) {
        uploadedPhotos.push(await this.cloudinary.uploadImage(image, 'products'));
      }
      if (receipt) {
        uploadedReceipt = await this.cloudinary.uploadImage(receipt, 'intake-receipts');
      }
      const sku = await this.resolveSku(dto.sku, dto.name);
      const product = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            name: dto.name.trim(),
            sku,
            barcode: dto.barcode?.trim() || null,
            description: dto.description?.trim() || null,
            categoryId: dto.categoryId,
            unit: dto.unit?.trim() || 'pcs',
            costPrice: money(dto.openingUnitCost ?? dto.costPrice ?? 0),
            retailPrice: money(dto.retailPrice),
            wholesalePrice: money(dto.wholesalePrice),
            wholesaleMinQty: dto.wholesaleMinQty ?? 1,
            reorderLevel: dto.reorderLevel ?? 0,
          },
        });
        if (uploadedPhotos.length) {
          await tx.storedFile.createMany({
            data: uploadedPhotos.map((file) => ({
              kind: FileKind.PRODUCT_PHOTO,
              url: file.url,
              publicId: file.publicId,
              bytes: file.bytes,
              mimeType: file.mimeType,
              productId: created.id,
            })),
          });
        }
        if (opening > 0) {
          const intake = await tx.stockIntake.create({
            data: {
              reference: 'OPENING',
              notes: 'Opening stock',
              receivedById: actor.id,
              items: {
                create: {
                  productId: created.id,
                  quantity: opening,
                  unitCost: dto.openingUnitCost ?? dto.costPrice ?? 0,
                },
              },
            },
          });
          if (uploadedReceipt) {
            await tx.storedFile.create({
              data: {
                kind: FileKind.INTAKE_RECEIPT,
                url: uploadedReceipt.url,
                publicId: uploadedReceipt.publicId,
                bytes: uploadedReceipt.bytes,
                mimeType: receipt?.mimetype,
                intakeId: intake.id,
              },
            });
          }
          await this.stock.receive(tx, {
            productId: created.id,
            quantity: opening,
            unitCost: dto.openingUnitCost ?? dto.costPrice ?? 0,
            referenceId: intake.id,
            createdById: actor.id,
            note: 'Opening stock',
          });
        }
        return tx.product.findUniqueOrThrow({ where: { id: created.id }, include: productInclude });
      });
      return presentProduct(product, actor.role);
    } catch (error) {
      await this.cleanup([...uploadedPhotos, ...(uploadedReceipt ? [uploadedReceipt] : [])]);
      rethrowKnownPrisma(error);
    }
  }

  async list(role: Role, query: ProductQueryDto) {
    if (query.barcode || query.sku) return this.lookup(role, query);
    const { page, pageSize, skip, take } = paging(query);
    const where = this.where(query);
    if (query.lowStock) {
      const rows = await this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        include: productInclude,
      });
      const low = rows.filter(
        (row) => row.reorderLevel > 0 && row.quantityOnHand <= row.reorderLevel,
      );
      return pageOf(
        low.slice(skip, skip + take).map((row) => presentProduct(row, role)),
        low.length,
        page,
        pageSize,
      );
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: productInclude,
      }),
      this.prisma.product.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => presentProduct(row, role)),
      total,
      page,
      pageSize,
    );
  }

  async get(role: Role, id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!product) throw new NotFoundException('Product not found');
    return presentProduct(product, role);
  }

  async update(role: Role, id: string, dto: UpdateProductDto) {
    await this.get(role, id);
    if (dto.categoryId) await this.ensureCategory(dto.categoryId);
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          sku: dto.sku?.trim(),
          barcode: dto.barcode === undefined ? undefined : dto.barcode,
          description: dto.description === undefined ? undefined : dto.description.trim() || null,
          categoryId: dto.categoryId,
          unit: dto.unit?.trim(),
          costPrice: dto.costPrice === undefined ? undefined : money(dto.costPrice),
          retailPrice: dto.retailPrice === undefined ? undefined : money(dto.retailPrice),
          wholesalePrice: dto.wholesalePrice === undefined ? undefined : money(dto.wholesalePrice),
          wholesaleMinQty: dto.wholesaleMinQty,
          reorderLevel: dto.reorderLevel,
          isActive: dto.isActive,
        },
        include: productInclude,
      });
      return presentProduct(product, role);
    } catch (error) {
      rethrowKnownPrisma(error);
    }
  }

  async addImages(role: Role, id: string, images: UploadedImage[]) {
    if (!images.length) throw new BadRequestException('Choose at least one image');
    await this.get(role, id);
    const uploaded: Asset[] = [];
    try {
      for (const image of images) {
        uploaded.push(await this.cloudinary.uploadImage(image, 'products'));
      }
      await this.prisma.storedFile.createMany({
        data: uploaded.map((file) => ({
          kind: FileKind.PRODUCT_PHOTO,
          url: file.url,
          publicId: file.publicId,
          bytes: file.bytes,
          mimeType: file.mimeType,
          productId: id,
        })),
      });
      return this.get(role, id);
    } catch (error) {
      await this.cleanup(uploaded);
      throw error;
    }
  }

  async removeImage(role: Role, productId: string, fileId: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, productId, kind: FileKind.PRODUCT_PHOTO },
    });
    if (!file) throw new NotFoundException('Image not found');
    await this.prisma.storedFile.delete({ where: { id: fileId } });
    await this.cloudinary.destroy(file.publicId).catch(() => undefined);
    return this.get(role, productId);
  }

  async remove(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    const movements = await this.prisma.stockMovement.count({ where: { productId: id } });
    if (movements > 0) {
      await this.prisma.product.update({ where: { id }, data: { isActive: false } });
      return { deactivated: true };
    }
    await this.prisma.product.delete({ where: { id } });
    return { deleted: true };
  }

  private async lookup(role: Role, query: ProductQueryDto) {
    const product = await this.prisma.product.findFirst({
      where: {
        ...(query.barcode ? { barcode: query.barcode } : {}),
        ...(query.sku ? { sku: query.sku } : {}),
      },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return presentProduct(product, role);
  }

  private where(query: ProductQueryDto): Prisma.ProductWhereInput {
    return {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { barcode: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async ensureCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
  }

  private async resolveSku(requested: string | undefined, name: string) {
    if (requested?.trim()) return requested.trim();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const sku = makeSku(name);
      const exists = await this.prisma.product.findUnique({ where: { sku } });
      if (!exists) return sku;
    }
    return makeSku(`${name}-${Date.now()}`);
  }

  private async cleanup(files: Asset[]) {
    await Promise.all(files.map((file) => this.cloudinary.destroy(file.publicId).catch(() => undefined)));
  }
}
