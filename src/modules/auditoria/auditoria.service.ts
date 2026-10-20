import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class AuditoriaService {
  constructor(private prisma: PrismaService) {}

  async registrar(data: {
    usuarioId?: string;
    accion: string;
    entidad: string;
    entidadId: string;
    valoresPrevios?: any;
    valoresNuevos?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditoria.create({
      data: {
        usuarioId: data.usuarioId,
        accion: data.accion,
        entidad: data.entidad,
        entidadId: data.entidadId,
        valoresPrevios: data.valoresPrevios,
        valoresNuevos: data.valoresNuevos,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  async getMetricas(user: any) {
    const isSuperAdmin = user.rol === Role.SUPER_ADMIN;
    const sedeId = user.sedeId;

    // Conteo de usuarios y vendedores
    const usuariosWhere: any = isSuperAdmin ? {} : { sedeId, rol: { not: Role.SUPER_ADMIN } };
    const totalUsuarios = await this.prisma.usuario.count({ where: usuariosWhere });
    const usuariosActivos = await this.prisma.usuario.count({
      where: { ...usuariosWhere, activo: true },
    });
    const totalVendedores = await this.prisma.usuario.count({
      where: { ...usuariosWhere, rol: Role.VENDEDOR, activo: true },
    });

    // Auditoría de accesos y seguridad
    const totalLogins = await this.prisma.auditoria.count({
      where: { accion: 'LOGIN_EXITOSO' },
    });
    const loginsFallidos = await this.prisma.auditoria.count({
      where: { accion: 'LOGIN_FALLIDO' },
    });
    const cambiosPrecioOAccionesCriticas = await this.prisma.auditoria.count({
      where: {
        accion: {
          in: ['MODIFICACION_PRECIO', 'APROBACION_DESCUENTO', 'DESCUENTO_AUTORIZADO', 'USUARIO_CREADO', 'ESTADO_USUARIO_CAMBIADO'],
        },
      },
    });

    // Conteo de cotizaciones
    const cotizacionesWhere: any = isSuperAdmin ? {} : { sedeId };
    const totalCotizaciones = await this.prisma.cotizacion.count({ where: cotizacionesWhere });
    const cotizacionesPendientesAprobacion = await this.prisma.cotizacion.count({
      where: { ...cotizacionesWhere, estado: 'BORRADOR' },
    });

    return {
      seguridad: {
        totalLoginsExitosos: totalLogins,
        intentosFallidosDetectados: loginsFallidos,
        tasaExitoLogin: totalLogins + loginsFallidos > 0 
          ? Math.round((totalLogins / (totalLogins + loginsFallidos)) * 100) 
          : 100,
        eventosCriticosAuditados: cambiosPrecioOAccionesCriticas,
        politicaSeguridad: {
          algoritmoHash: 'bcrypt (saltRounds: 10)',
          tokenType: 'JWT Bearer (HS256)',
          vigenciaToken: '7 días',
          proteccionFuerzaBruta: 'Activa (Máx 5 intentos)',
          auditoriaActiva: true,
        },
      },
      usuarios: {
        total: totalUsuarios,
        activos: usuariosActivos,
        vendedores: totalVendedores,
      },
      cotizaciones: {
        total: totalCotizaciones,
        requierenAprobacion: cotizacionesPendientesAprobacion,
      },
    };
  }

  async getLogs(user: any, limit = 50) {
    const isSuperAdmin = user.rol === Role.SUPER_ADMIN || user.rol === 'SUPER_ADMIN';
    const where: any = isSuperAdmin
      ? {}
      : {
          usuario: {
            rol: { not: Role.SUPER_ADMIN },
            sedeId: user.sedeId,
          },
        };

    return this.prisma.auditoria.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        usuario: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            email: true,
            rol: true,
            codigoVendedor: true,
          },
        },
      },
    });
  }
}
