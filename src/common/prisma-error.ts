import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function rethrowKnownPrisma(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.join(', ') : 'value';
    throw new ConflictException(`A record with this ${fields} already exists`);
  }
  throw error;
}
