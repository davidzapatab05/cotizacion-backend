import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

function normalizeText(text?: string): string | undefined {
  if (!text) return text;
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

@Injectable()
export class RolesMgmtService {
  constructor(private prisma: PrismaService) {}

  async findAllRoles(currentUser?: any, query?: { search?: string; activo?: string }) {
    const isSuperAdmin = currentUser?.rol === Role.SUPER_ADMIN || currentUser?.rol === 'SUPER_ADMIN';
    const where: any = {};

    if (!isSuperAdmin) {
      where.nombre = {
        notIn: ['SUPER_ADMIN', 'SUPER ADMINISTRADOR'],
      };
    }

    if (query?.activo !== undefined && query?.activo !== '') {
      where.activo = query.activo === 'true' || query.activo === '1';
    }

    if (query?.search) {
      const s = query.search.trim().toUpperCase();
      if (where.nombre?.notIn) {
        where.AND = [
          { nombre: { notIn: ['SUPER_ADMIN', 'SUPER ADMINISTRADOR'] } },
          { nombre: { contains: s } },
        ];
        delete where.nombre;
      } else {
        where.nombre = { contains: s };
      }
    }

    return this.prisma.rolDefinicion.findMany({
      where,
      include: {
        permisos: {
          include: {
            permiso: true,
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async findAllPermisos() {
    return this.prisma.permiso.findMany({
      orderBy: [{ modulo: 'asc' }, { accion: 'asc' }],
    });
  }

  async crearRol(data: { nombre: string; descripcion?: string; permisoIds: string[] }) {
    const nombreNormalizado = normalizeText(data.nombre) || data.nombre.toUpperCase();
    const existing = await this.prisma.rolDefinicion.findUnique({
      where: { nombre: nombreNormalizado },
    });
    if (existing) {
      throw new ConflictException('Ya existe un rol con ese nombre');
    }

    const rol = await this.prisma.rolDefinicion.create({
      data: {
        nombre: nombreNormalizado,
        descripcion: data.descripcion,
        esSistema: false,
        activo: true,
        permisos: {
          create: (data.permisoIds || []).map((pId) => ({
            permisoId: pId,
          })),
        },
      },
      include: {
        permisos: {
          include: { permiso: true },
        },
      },
    });

    return rol;
  }

  async editarRol(id: string, data: { nombre?: string; descripcion?: string; activo?: boolean; permisoIds?: string[] }) {
    const rol = await this.prisma.rolDefinicion.findUnique({ where: { id } });
    if (!rol) throw new NotFoundException('Rol no encontrado');

    const updateData: any = {};
    if (data.nombre) {
      updateData.nombre = normalizeText(data.nombre);
    }
    if (data.descripcion !== undefined) {
      updateData.descripcion = data.descripcion;
    }
    if (data.activo !== undefined) {
      updateData.activo = data.activo;
    }

    await this.prisma.rolDefinicion.update({
      where: { id },
      data: updateData,
    });

    if (data.permisoIds && Array.isArray(data.permisoIds)) {
      await this.actualizarPermisosRol(id, data.permisoIds);
    }

    return this.prisma.rolDefinicion.findUnique({
      where: { id },
      include: {
        permisos: { include: { permiso: true } },
      },
    });
  }

  async toggleEstadoRol(id: string) {
    const rol = await this.prisma.rolDefinicion.findUnique({ where: { id } });
    if (!rol) throw new NotFoundException('Rol no encontrado');

    const nombreUpper = (rol.nombre || '').toUpperCase().trim();
    if ((nombreUpper === 'SUPER_ADMIN' || nombreUpper === 'SUPER ADMINISTRADOR') && rol.activo) {
      throw new ForbiddenException('El rol SUPER ADMINISTRADOR debe permanecer activo permanentemente.');
    }

    return this.prisma.rolDefinicion.update({
      where: { id },
      data: { activo: !rol.activo },
      include: {
        permisos: { include: { permiso: true } },
      },
    });
  }

  async eliminarRol(id: string) {
    const rol = await this.prisma.rolDefinicion.findUnique({ where: { id } });
    if (!rol) throw new NotFoundException('Rol no encontrado');

    const nombreUpper = (rol.nombre || '').toUpperCase().trim();
    if (nombreUpper === 'SUPER_ADMIN' || nombreUpper === 'SUPER ADMINISTRADOR') {
      throw new ForbiddenException('El rol SUPER ADMINISTRADOR es esencial para el sistema y no puede ser eliminado.');
    }

    let usuariosConRol = 0;
    if (Object.values(Role).includes(rol.nombre as any)) {
      usuariosConRol = await this.prisma.usuario.count({
        where: { rol: rol.nombre as any },
      });
    }

    if (usuariosConRol > 0) {
      throw new ConflictException(`No se puede eliminar el rol porque está asignado a ${usuariosConRol} usuario(s). Reasigne primero a los usuarios.`);
    }

    await this.prisma.rolPermiso.deleteMany({ where: { rolId: id } });
    await this.prisma.rolDefinicion.delete({ where: { id } });

    return { message: `Rol ${rol.nombre} eliminado exitosamente.` };
  }

  async actualizarPermisosRol(rolId: string, permisoIds: string[]) {
    // Eliminar permisos anteriores
    await this.prisma.rolPermiso.deleteMany({
      where: { rolId },
    });

    // Insertar nuevos
    await this.prisma.rolPermiso.createMany({
      data: permisoIds.map((pId) => ({
        rolId,
        permisoId: pId,
      })),
    });

    return this.prisma.rolDefinicion.findUnique({
      where: { id: rolId },
      include: {
        permisos: {
          include: { permiso: true },
        },
      },
    });
  }

  async obtenerPermisosEfectivosUsuario(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        permisosDirectos: {
          include: { permiso: true },
        },
      },
    });

    if (!usuario) throw new NotFoundException('Usuario no encontrado');

    // Permisos del rol
    const rolDef = await this.prisma.rolDefinicion.findUnique({
      where: { nombre: usuario.rol },
      include: {
        permisos: {
          include: { permiso: true },
        },
      },
    });

    const permisosMap = new Map<string, { modulo: string; accion: string; origen: 'ROL' | 'DIRECTO' }>();

    // 1. Cargar permisos del rol
    if (rolDef) {
      for (const rp of rolDef.permisos) {
        permisosMap.set(rp.permiso.codigo, {
          modulo: rp.permiso.modulo,
          accion: rp.permiso.accion,
          origen: 'ROL',
        });
      }
    }

    // 2. Aplicar overrides directos del usuario (extensiones o revocaciones)
    for (const up of usuario.permisosDirectos) {
      if (up.concedido) {
        permisosMap.set(up.permiso.codigo, {
          modulo: up.permiso.modulo,
          accion: up.permiso.accion,
          origen: 'DIRECTO',
        });
      } else {
        permisosMap.delete(up.permiso.codigo);
      }
    }

    return {
      usuarioId,
      email: usuario.email,
      rol: usuario.rol,
      permisos: Array.from(permisosMap.keys()),
      detalle: Array.from(permisosMap.entries()).map(([codigo, val]) => ({
        codigo,
        modulo: val.modulo,
        accion: val.accion,
        origen: val.origen,
      })),
    };
  }

  async actualizarPermisosUsuario(usuarioId: string, overrides: { permisoId: string; concedido: boolean }[]) {
    await this.prisma.usuarioPermiso.deleteMany({
      where: { usuarioId },
    });

    await this.prisma.usuarioPermiso.createMany({
      data: overrides.map((o) => ({
        usuarioId,
        permisoId: o.permisoId,
        concedido: o.concedido,
      })),
    });

    return this.obtenerPermisosEfectivosUsuario(usuarioId);
  }
}
