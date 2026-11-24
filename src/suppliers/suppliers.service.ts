import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsOptional } from 'class-validator';
import { pageOf, paging, PageQueryDto } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

class SupplierQuery extends PageQueryDto {
  @IsOptional()
  search?: string;

  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;
}

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        address: dto.address?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async list(query: SupplierQuery) {
    const { page, pageSize, skip, take } = paging(query);
    const where: Prisma.SupplierWhereInput = {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.supplier.count({ where }),
    ]);
    return pageOf(rows, total, page, pageSize);
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.ensure(id);
    return this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone === undefined ? undefined : dto.phone.trim() || null,
        email: dto.email === undefined ? undefined : dto.email.trim().toLowerCase() || null,
        address: dto.address === undefined ? undefined : dto.address.trim() || null,
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
        isActive: dto.isActive,
      },
    });
  }

  async ensure(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }
}

export { SupplierQuery };
