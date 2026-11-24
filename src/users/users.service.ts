import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { AuthUser } from '../common/auth-user';
import { pageOf, paging, PageQueryDto } from '../common/page';
import { rethrowKnownPrisma } from '../common/prisma-error';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: AuthUser, dto: CreateUserDto) {
    this.assertCanAssign(actor, dto.role);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          passwordHash,
          fullName: dto.fullName.trim(),
          phone: dto.phone?.trim() || null,
          role: dto.role,
        },
      });
      return toPublicUser(user);
    } catch (error) {
      rethrowKnownPrisma(error);
    }
  }

  async list(query: PageQueryDto & { search?: string; role?: Role }) {
    const { page, pageSize, skip, take } = paging(query);
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.count({ where }),
    ]);
    return pageOf(rows.map(toPublicUser), total, page, pageSize);
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return toPublicUser(user);
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    this.assertCanAssign(actor, existing.role);
    if (dto.role) this.assertCanAssign(actor, dto.role);
    if (actor.id === id && dto.role && dto.role !== actor.role) {
      throw new ForbiddenException('You cannot change your own role');
    }
    if (actor.id === id && dto.isActive === false) {
      throw new BadRequestException('You cannot disable your own account');
    }
    if (existing.role === Role.SUPER_ADMIN && dto.isActive === false) {
      const activeSupers = await this.prisma.user.count({
        where: { role: Role.SUPER_ADMIN, isActive: true },
      });
      if (activeSupers <= 1) {
        throw new BadRequestException('The last super admin cannot be disabled');
      }
    }

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          email: dto.email?.trim().toLowerCase(),
          fullName: dto.fullName?.trim(),
          phone: dto.phone === undefined ? undefined : dto.phone.trim() || null,
          role: dto.role,
          isActive: dto.isActive,
          passwordHash,
        },
      });
      return toPublicUser(user);
    } catch (error) {
      rethrowKnownPrisma(error);
    }
  }

  private assertCanAssign(actor: AuthUser, role: Role) {
    if (actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.ADMIN && role !== Role.SUPER_ADMIN) return;
    throw new ForbiddenException('Only a super admin can manage super admin accounts');
  }
}
