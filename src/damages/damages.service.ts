import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FileKind, StockMovementType } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { pageOf, paging, PageQueryDto } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { CloudinaryService } from '../uploads/cloudinary.service';
import { UploadedImage } from '../uploads/uploaded-image';
import { CreateDamageDto } from './dto/create-damage.dto';

@Injectable()
export class DamagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(actor: AuthUser, dto: CreateDamageDto, images: UploadedImage[]) {
    if (!images.length) {
      throw new BadRequestException('Add at least one photo of the damage');
    }
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    const uploaded: Array<{ url: string; publicId: string; bytes: number }> = [];
    try {
      for (const image of images) {
        uploaded.push(await this.cloudinary.uploadImage(image, 'damages'));
      }
      return await this.prisma.$transaction(async (tx) => {
        const report = await tx.damageReport.create({
          data: {
            productId: dto.productId,
            quantity: dto.quantity,
            reason: dto.reason.trim(),
            notes: dto.notes?.trim() || null,
            reportedById: actor.id,
          },
        });
        await tx.storedFile.createMany({
          data: uploaded.map((file, index) => ({
            kind: FileKind.DAMAGE_PHOTO,
            url: file.url,
            publicId: file.publicId,
            bytes: file.bytes,
            mimeType: images[index]?.mimetype,
            damageId: report.id,
          })),
        });
        await this.stock.apply(tx, {
          productId: dto.productId,
          quantity: -dto.quantity,
          type: StockMovementType.DAMAGE,
          referenceId: report.id,
          createdById: actor.id,
          note: dto.reason.trim(),
        });
        return tx.damageReport.findUnique({
          where: { id: report.id },
          include: {
            images: true,
            product: { select: { id: true, name: true, sku: true } },
            reportedBy: { select: { id: true, fullName: true } },
          },
        });
      });
    } catch (error) {
      await Promise.all(uploaded.map((file) => this.cloudinary.destroy(file.publicId).catch(() => undefined)));
      throw error;
    }
  }

  async list(query: PageQueryDto) {
    const { page, pageSize, skip, take } = paging(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.damageReport.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          images: true,
          product: { select: { id: true, name: true, sku: true } },
          reportedBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.damageReport.count(),
    ]);
    return pageOf(rows, total, page, pageSize);
  }

  async get(id: string) {
    const row = await this.prisma.damageReport.findUnique({
      where: { id },
      include: {
        images: true,
        product: { select: { id: true, name: true, sku: true } },
        reportedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!row) throw new NotFoundException('Damage report not found');
    return row;
  }
}
