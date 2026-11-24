import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category } from '@prisma/client';
import { slugify } from '../common/slug';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

type CategoryNode = Category & { children: CategoryNode[] };

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async tree() {
    const rows = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    return this.buildTree(rows);
  }

  async create(dto: CreateCategoryDto) {
    await this.assertParent(dto.parentId);
    await this.assertUniqueName(dto.name, dto.parentId ?? null);
    const slug = await this.uniqueSlug(dto.name);
    return this.prisma.category.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        parentId: dto.parentId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.find(id);
    const parentId = dto.parentId === undefined ? existing.parentId : dto.parentId;
    if (parentId === id) throw new BadRequestException('A category cannot be its own parent');
    if (parentId) {
      await this.assertParent(parentId);
      const childCount = await this.prisma.category.count({ where: { parentId: id } });
      if (childCount > 0) {
        throw new BadRequestException(
          'Move or remove sub-categories before placing this category under another',
        );
      }
    }
    const name = dto.name?.trim() ?? existing.name;
    await this.assertUniqueName(name, parentId, id);
    const slug =
      dto.name && dto.name.trim() !== existing.name ? await this.uniqueSlug(name, id) : undefined;
    return this.prisma.category.update({
      where: { id },
      data: {
        name,
        slug,
        description: dto.description === undefined ? undefined : dto.description.trim() || null,
        parentId,
      },
    });
  }

  async remove(id: string) {
    await this.find(id);
    const [children, products] = await this.prisma.$transaction([
      this.prisma.category.count({ where: { parentId: id } }),
      this.prisma.product.count({ where: { categoryId: id } }),
    ]);
    if (children > 0) {
      throw new ConflictException('Remove sub-categories before deleting this category');
    }
    if (products > 0) {
      throw new ConflictException('Reassign products before deleting this category');
    }
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  private async find(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  private async assertParent(parentId?: string | null) {
    if (!parentId) return;
    const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Parent category not found');
    if (parent.parentId) {
      throw new BadRequestException('Sub-categories cannot contain another level');
    }
  }

  private async assertUniqueName(name: string, parentId: string | null, ignoreId?: string) {
    const existing = await this.prisma.category.findFirst({
      where: {
        parentId,
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException('A category with this name already exists here');
    }
  }

  private async uniqueSlug(name: string, ignoreId?: string) {
    const base = slugify(name);
    let slug = base;
    let n = 2;
    while (
      await this.prisma.category.findFirst({
        where: { slug, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
      })
    ) {
      slug = `${base}-${n++}`;
    }
    return slug;
  }

  private buildTree(rows: Category[]): CategoryNode[] {
    const nodes = new Map<string, CategoryNode>();
    for (const row of rows) nodes.set(row.id, { ...row, children: [] });
    const roots: CategoryNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }
}
