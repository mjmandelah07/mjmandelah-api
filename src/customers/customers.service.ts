import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { AuthUser } from '../common/auth-user';
import { money, toMoney } from '../common/money';
import { pageOf, paging, PageQueryDto } from '../common/page';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, CustomerPaymentDto, UpdateCustomerDto } from './dto/customer.dto';

export class CustomerQuery extends PageQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

function present(customer: Customer) {
  return { ...customer, balance: toMoney(customer.balance) };
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto) {
    const customer = await this.prisma.customer.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        address: dto.address?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
    return present(customer);
  }

  async list(query: CustomerQuery) {
    const { page, pageSize, skip, take } = paging(query);
    const where: Prisma.CustomerWhereInput = {
      isActive: true,
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
      this.prisma.customer.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.customer.count({ where }),
    ]);
    return pageOf(rows.map(present), total, page, pageSize);
  }

  async get(id: string) {
    const customer = await this.ensure(id);
    const payments = await this.prisma.customerPayment.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { receivedBy: { select: { id: true, fullName: true } } },
    });
    return {
      ...present(customer),
      payments: payments.map((payment) => ({
        ...payment,
        amount: toMoney(payment.amount),
      })),
    };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.ensure(id);
    const customer = await this.prisma.customer.update({
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
    return present(customer);
  }

  async takePayment(actor: AuthUser, id: string, dto: CustomerPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ balance: string }>>`
        SELECT "balance"::text AS balance FROM "Customer" WHERE "id" = ${id} FOR UPDATE
      `;
      if (!rows.length) throw new NotFoundException('Customer not found');
      const balance = Number(rows[0].balance);
      if (dto.amount > balance) {
        throw new BadRequestException('Payment is more than the balance due');
      }
      const next = Math.round((balance - dto.amount) * 100) / 100;
      const customer = await tx.customer.update({
        where: { id },
        data: { balance: money(next) },
      });
      const payment = await tx.customerPayment.create({
        data: {
          customerId: id,
          amount: money(dto.amount),
          note: dto.note?.trim() || null,
          receivedById: actor.id,
        },
      });
      return { customer: present(customer), payment: { ...payment, amount: toMoney(payment.amount) } };
    });
  }

  async ensure(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer || !customer.isActive) throw new NotFoundException('Customer not found');
    return customer;
  }
}
