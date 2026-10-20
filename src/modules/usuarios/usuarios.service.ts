import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import * as bcrypt from 'bcryptjs';
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
export class UsuariosService {
  constructor(
    private prisma: PrismaService,
    private auditoria: AuditoriaService,
  ) {}

  async findAll(currentUser: any, query?: { search?: string; activo?: string; sedeId?: string }) {
    const isSuperAdmin = currentUser.rol === Role.SUPER_ADMIN || currentUser.rol === 'SUPER_ADMIN';
    // Si NO es Super Admin: Ocultar TODOS los Super Admins y restringir a su sede
    const where: any = {};

    if (!isSuperAdmin) {
      where.rol = { not: Role.SUPER_ADMIN };
      where.sedeId = currentUser.sedeId;
    } else if (query?.sedeId) {
      where.sedeId = query.sedeId;
    }

    if (query?.activo !== undefined && query?.activo !== '') {
      where.activo = query.activo === 'true' || query.activo === '1';
    }

    if (query?.search) {
      const q = query.search.trim();
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { nombres: { contains: q, mode: 'insensitive' } },
            { apellidos: { contains: q, mode: 'insensitive' } },
            { codigoVendedor: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const usuarios = await this.prisma.usuario.findMany({
      where,
      include: {
        sede: {
          select: { id: true, nombre: true, codigo: true, ciudad: true },
        },
        sedesPermitidas: {
          include: {
            sede: {
              select: { id: true, nombre: true, codigo: true, ciudad: true },
            },
          },
        },
        _count: {
          select: { cotizacionesCreadas: true },
        },
      },
      orderBy: [{ activo: 'desc' }, { rol: 'asc' }, { nombres: 'asc' }],
    });

    return usuarios.map((u) => ({
      id: u.id,
      email: u.email,
      nombres: u.nombres,
      apellidos: u.apellidos,
      telefono: u.telefono,
      codigoVendedor: u.codigoVendedor,
      rol: u.rol,
      sede: u.sede,
      accesoTodasSedes: u.accesoTodasSedes,
      sedesPermitidas: u.sedesPermitidas.map((sp) => sp.sede),
      activo: u.activo,
      descuentoMaximo: Number(u.descuentoMaximo),
      totalCotizaciones: u._count.cotizacionesCreadas,
      createdAt: u.createdAt,
    }));
  }

  async create(
    adminUser: any,
    data: {
      email: string;
      passwordPlain: string;
      nombres: string;
      apellidos: string;
      telefono?: string;
      codigoVendedor?: string;
      rol: Role;
      sedeId?: string;
      accesoTodasSedes?: boolean;
      sedesIds?: string[];
      descuentoMaximo?: number;
    },
  ) {
    const isSuperAdmin = adminUser.rol === Role.SUPER_ADMIN || adminUser.rol === 'SUPER_ADMIN';
    const isTargetSuperAdmin = data.rol === Role.SUPER_ADMIN || (data.rol as string) === 'SUPER_ADMIN';

    // Regla de jerarquía: solo un Super Admin puede crear a otro Super Admin
    if (isTargetSuperAdmin && !isSuperAdmin) {
      throw new ForbiddenException('Solo un Super Administrador puede crear otros Super Administradores.');
    }

    // Un Administrador de Sede solo puede crear roles de su rango hacia abajo en su propia sede
    if (!isSuperAdmin) {
      if (data.rol === Role.ADMIN_SEDE || (data.rol as string) === 'ADMIN_SEDE') {
        throw new ForbiddenException('Un Administrador de Sede solo puede crear Asesores Comerciales.');
      }
    }

    const targetSedeId = isSuperAdmin ? (data.sedeId || adminUser.sedeId) : adminUser.sedeId;

    const existing = await this.prisma.usuario.findFirst({
      where: {
        OR: [
          { email: data.email },
          ...(data.codigoVendedor ? [{ codigoVendedor: data.codigoVendedor }] : []),
        ],
      },
    });

    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo electrónico o código de vendedor.');
    }

    if (!data.passwordPlain || data.passwordPlain.length < 8) {
      throw new BadRequestException('La contraseña debe tener como mínimo 8 caracteres.');
    }
    if (!/[A-Z]/.test(data.passwordPlain)) {
      throw new BadRequestException('La contraseña debe incluir al menos una letra mayúscula.');
    }
    if (!/[0-9]/.test(data.passwordPlain)) {
      throw new BadRequestException('La contraseña debe incluir al menos un número.');
    }

    const passwordHash = await bcrypt.hash(data.passwordPlain, 10);

    const newUser = await this.prisma.usuario.create({
      data: {
        email: data.email,
        passwordHash,
        nombres: data.nombres,
        apellidos: data.apellidos,
        telefono: data.telefono,
        codigoVendedor: data.codigoVendedor,
        rol: data.rol,
        sedeId: targetSedeId,
        accesoTodasSedes: !!data.accesoTodasSedes,
        descuentoMaximo: data.descuentoMaximo ?? (data.rol === Role.VENDEDOR ? 5.0 : 0.0),
        activo: true,
      },
      include: {
        sede: true,
      },
    });

    if (data.sedesIds && data.sedesIds.length > 0) {
      await this.prisma.usuarioSede.createMany({
        data: data.sedesIds.map((sId) => ({
          usuarioId: newUser.id,
          sedeId: sId,
        })),
        skipDuplicates: true,
      });
    }

    // Auditoría
    await this.auditoria.registrar({
      usuarioId: adminUser.id,
      accion: 'USUARIO_CREADO',
      entidad: 'Usuario',
      entidadId: newUser.id,
      valoresNuevos: {
        email: newUser.email,
        nombres: `${newUser.nombres} ${newUser.apellidos}`,
        rol: newUser.rol,
        codigoVendedor: newUser.codigoVendedor,
        sedeId: targetSedeId,
        accesoTodasSedes: !!data.accesoTodasSedes,
        sedesIds: data.sedesIds || [],
      },
    });

    return {
      id: newUser.id,
      email: newUser.email,
      nombres: newUser.nombres,
      apellidos: newUser.apellidos,
      codigoVendedor: newUser.codigoVendedor,
      rol: newUser.rol,
      sede: newUser.sede.nombre,
      descuentoMaximo: Number(newUser.descuentoMaximo),
      activo: newUser.activo,
    };
  }

  async toggleEstado(adminUser: any, userId: string) {
    if (adminUser.id === userId) {
      throw new ForbiddenException('No puedes desactivar tu propia cuenta de usuario.');
    }

    const targetUser = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!targetUser) throw new NotFoundException('Usuario no encontrado');

    const isSuperAdmin = adminUser.rol === Role.SUPER_ADMIN || adminUser.rol === 'SUPER_ADMIN';
    const isTargetSuperAdmin = targetUser.rol === Role.SUPER_ADMIN || (targetUser.rol as string) === 'SUPER_ADMIN';

    if (isTargetSuperAdmin && !isSuperAdmin) {
      throw new ForbiddenException('Acceso denegado sobre cuentas de Super Administrador.');
    }

    if (!isSuperAdmin && targetUser.sedeId !== adminUser.sedeId) {
      throw new ForbiddenException('Solo puedes modificar usuarios de tu propia sede.');
    }

    const nuevoEstado = !targetUser.activo;

    const updated = await this.prisma.usuario.update({
      where: { id: userId },
      data: { activo: nuevoEstado },
    });

    // Auditoría
    await this.auditoria.registrar({
      usuarioId: adminUser.id,
      accion: 'ESTADO_USUARIO_CAMBIADO',
      entidad: 'Usuario',
      entidadId: userId,
      valoresPrevios: { activo: targetUser.activo },
      valoresNuevos: { activo: nuevoEstado },
    });

    return { id: updated.id, activo: updated.activo };
  }

  async updateDescuento(adminUser: any, userId: string, nuevoDescuento: number) {
    if (nuevoDescuento < 0 || nuevoDescuento > 20) {
      throw new ForbiddenException('El descuento comercial debe estar entre 0% y 20%.');
    }

    const targetUser = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!targetUser) throw new NotFoundException('Usuario no encontrado');

    const isSuperAdmin = adminUser.rol === Role.SUPER_ADMIN || adminUser.rol === 'SUPER_ADMIN';
    if (targetUser.rol === Role.SUPER_ADMIN && !isSuperAdmin) {
      throw new ForbiddenException('Acceso denegado sobre cuentas de Super Administrador.');
    }

    const updated = await this.prisma.usuario.update({
      where: { id: userId },
      data: { descuentoMaximo: nuevoDescuento },
    });

    // Auditoría
    await this.auditoria.registrar({
      usuarioId: adminUser.id,
      accion: 'DESCUENTO_AUTORIZADO',
      entidad: 'Usuario',
      entidadId: userId,
      valoresPrevios: { descuentoMaximo: Number(targetUser.descuentoMaximo) },
      valoresNuevos: { descuentoMaximo: nuevoDescuento },
    });

    return { id: updated.id, descuentoMaximo: Number(updated.descuentoMaximo) };
  }

  async resetPassword(adminUser: any, userId: string, nuevaPasswordPlain: string) {
    const targetUser = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!targetUser) throw new NotFoundException('Usuario no encontrado');

    const isSuperAdmin = adminUser.rol === Role.SUPER_ADMIN || adminUser.rol === 'SUPER_ADMIN';
    if (targetUser.rol === Role.SUPER_ADMIN && !isSuperAdmin) {
      throw new ForbiddenException('Acceso denegado sobre cuentas de Super Administrador.');
    }

    if (!nuevaPasswordPlain || nuevaPasswordPlain.length < 8) {
      throw new BadRequestException('La contraseña debe tener como mínimo 8 caracteres.');
    }
    if (!/[A-Z]/.test(nuevaPasswordPlain)) {
      throw new BadRequestException('La contraseña debe incluir al menos una letra mayúscula.');
    }
    if (!/[0-9]/.test(nuevaPasswordPlain)) {
      throw new BadRequestException('La contraseña debe incluir al menos un número.');
    }

    const passwordHash = await bcrypt.hash(nuevaPasswordPlain, 10);

    await this.prisma.usuario.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Auditoría
    await this.auditoria.registrar({
      usuarioId: adminUser.id,
      accion: 'PASSWORD_RESET',
      entidad: 'Usuario',
      entidadId: userId,
    });

    return { message: 'Contraseña actualizada exitosamente.' };
  }

  async cambiarPassword(userId: string, data: { passwordActual: string; nuevaPassword: string }) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const match = await bcrypt.compare(data.passwordActual, user.passwordHash);
    if (!match) {
      throw new BadRequestException('La contraseña actual es incorrecta.');
    }

    if (!data.nuevaPassword || data.nuevaPassword.length < 8) {
      throw new BadRequestException('La nueva contraseña debe tener como mínimo 8 caracteres.');
    }
    if (!/[A-Z]/.test(data.nuevaPassword)) {
      throw new BadRequestException('La nueva contraseña debe incluir al menos una letra mayúscula.');
    }
    if (!/[0-9]/.test(data.nuevaPassword)) {
      throw new BadRequestException('La nueva contraseña debe incluir al menos un número.');
    }

    const passwordHash = await bcrypt.hash(data.nuevaPassword, 10);

    await this.prisma.usuario.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.auditoria.registrar({
      usuarioId: userId,
      accion: 'PASSWORD_CAMBIADA_POR_USUARIO',
      entidad: 'Usuario',
      entidadId: userId,
    });

    return { message: 'Tu contraseña ha sido cambiada correctamente.' };
  }

  async updatePerfil(userId: string, data: { nombres?: string; apellidos?: string; telefono?: string }) {
    const updated = await this.prisma.usuario.update({
      where: { id: userId },
      data: {
        ...(data.nombres ? { nombres: normalizeText(data.nombres) } : {}),
        ...(data.apellidos ? { apellidos: normalizeText(data.apellidos) } : {}),
        ...(data.telefono !== undefined ? { telefono: data.telefono } : {}),
      },
      include: { sede: true },
    });

    return {
      id: updated.id,
      email: updated.email,
      nombres: updated.nombres,
      apellidos: updated.apellidos,
      telefono: updated.telefono,
      codigoVendedor: updated.codigoVendedor,
      rol: updated.rol,
      sede: updated.sede,
      descuentoMaximo: Number(updated.descuentoMaximo),
    };
  }

  async updateSedesPermitidas(
    adminUser: any,
    id: string,
    data: { accesoTodasSedes: boolean; sedesIds?: string[] },
  ) {
    const isSuperAdmin = adminUser.rol === Role.SUPER_ADMIN || adminUser.rol === 'SUPER_ADMIN';
    if (!isSuperAdmin) {
      throw new ForbiddenException('Solo un Super Administrador puede asignar múltiples sedes a un colaborador.');
    }

    const user = await this.prisma.usuario.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    await this.prisma.usuario.update({
      where: { id },
      data: { accesoTodasSedes: !!data.accesoTodasSedes },
    });

    await this.prisma.usuarioSede.deleteMany({ where: { usuarioId: id } });

    if (data.sedesIds && data.sedesIds.length > 0) {
      await this.prisma.usuarioSede.createMany({
        data: data.sedesIds.map((sId) => ({
          usuarioId: id,
          sedeId: sId,
        })),
        skipDuplicates: true,
      });
    }

    const updated = await this.prisma.usuario.findUnique({
      where: { id },
      include: {
        sede: true,
        sedesPermitidas: {
          include: { sede: true },
        },
      },
    });

    return {
      ok: true,
      message: 'Permisos de sedes actualizados con éxito.',
      id: updated?.id,
      accesoTodasSedes: updated?.accesoTodasSedes,
      sedesPermitidas: updated?.sedesPermitidas.map((us) => us.sede) || [],
    };
  }
}
