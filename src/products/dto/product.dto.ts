import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : undefined;
};

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  sku?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  barcode?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  description?: string;

  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  costPrice?: number;

  @Type(() => Number)
  @Min(0)
  retailPrice: number;

  @Type(() => Number)
  @Min(0)
  wholesalePrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wholesaleMinQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  openingQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  openingUnitCost?: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  sku?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  retailPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  wholesalePrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wholesaleMinQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 'false' || value === false ? value === true || value === 'true' : value)
  @IsBoolean()
  isActive?: boolean;
}
