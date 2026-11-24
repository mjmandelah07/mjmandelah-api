import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const MANAGERS: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];
export const ALL_STAFF: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER];
