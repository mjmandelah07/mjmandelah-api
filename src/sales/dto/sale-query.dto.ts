import { PaymentMethod, Prisma, SaleChannel, SaleStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../common/page';

export class SaleQueryDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(SaleChannel)
  channel?: SaleChannel;

  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsUUID()
  cashierId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export function saleWhere(query: SaleQueryDto): Prisma.SaleWhereInput {
  return {
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
    ...(query.cashierId ? { cashierId: query.cashierId } : {}),
    ...(query.productId ? { items: { some: { productId: query.productId } } } : {}),
    ...(query.search
      ? { receiptNumber: { contains: query.search, mode: 'insensitive' } }
      : {}),
  };
}
