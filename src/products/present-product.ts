import { FileKind, Prisma, Product, Role, StoredFile } from '@prisma/client';
import { toMoney } from '../common/money';

type ProductWithFiles = Product & {
  files: StoredFile[];
  category: { id: string; name: string; slug: string; parentId: string | null };
};

export function presentProduct(product: ProductWithFiles, role: Role) {
  const photos = product.files.filter((file) => file.kind === FileKind.PRODUCT_PHOTO);
  const base = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    description: product.description,
    unit: product.unit,
    category: product.category,
    retailPrice: toMoney(product.retailPrice),
    wholesalePrice: toMoney(product.wholesalePrice),
    wholesaleMinQty: product.wholesaleMinQty,
    quantityOnHand: product.quantityOnHand,
    reorderLevel: product.reorderLevel,
    isLowStock: product.reorderLevel > 0 && product.quantityOnHand <= product.reorderLevel,
    isActive: product.isActive,
    images: photos.map((file) => ({
      id: file.id,
      url: file.url,
      createdAt: file.createdAt,
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
  if (role === Role.CASHIER) return base;
  return { ...base, costPrice: toMoney(product.costPrice) };
}

export const productInclude = {
  files: { orderBy: { createdAt: 'asc' as const } },
  category: { select: { id: true, name: true, slug: true, parentId: true } },
} satisfies Prisma.ProductInclude;
