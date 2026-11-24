import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const DEFAULTS = {
  id: 1,
  name: 'Mjmandelah Store',
  currency: 'NGN',
  receiptFooter: 'Thank you for shopping with us.',
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    return this.prisma.storeProfile.upsert({
      where: { id: 1 },
      update: {},
      create: DEFAULTS,
    });
  }

  async update(dto: UpdateSettingsDto) {
    await this.get();
    return this.prisma.storeProfile.update({
      where: { id: 1 },
      data: {
        name: dto.name?.trim(),
        address: dto.address === undefined ? undefined : dto.address.trim() || null,
        phone: dto.phone === undefined ? undefined : dto.phone.trim() || null,
        email: dto.email === undefined ? undefined : dto.email.trim() || null,
        currency: dto.currency?.trim().toUpperCase(),
        receiptFooter: dto.receiptFooter === undefined ? undefined : dto.receiptFooter.trim() || null,
      },
    });
  }
}
