import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Usuario no autenticado.');
    }

    // SUPER_ADMIN tiene acceso jerárquico universal
    if (user.rol === Role.SUPER_ADMIN) {
      return true;
    }

    const hasRole = requiredRoles.some((role) => user.rol === role);
    if (!hasRole) {
      throw new ForbiddenException(`Acceso denegado. Se requiere uno de los roles: [${requiredRoles.join(', ')}]`);
    }

    return true;
  }
}
