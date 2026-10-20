import { Injectable, UnauthorizedException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Role } from '@prisma/client';

interface FailedAttemptTracker {
  count: number;
  blockedUntil?: number;
}

@Injectable()
export class AuthService {
  // Rastreo en memoria contra ataques de fuerza bruta
  private failedAttempts: Map<string, FailedAttemptTracker> = new Map();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private auditoria: AuditoriaService,
  ) {}

  async login(email: string, passwordPlain: string, ipAddress?: string, userAgent?: string) {
    const tracker = this.failedAttempts.get(email);
    const now = Date.now();

    // Verificación de bloqueo por fuerza bruta
    if (tracker && tracker.blockedUntil && tracker.blockedUntil > now) {
      const waitSeconds = Math.ceil((tracker.blockedUntil - now) / 1000);
      throw new ForbiddenException(
        `Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intente de nuevo en ${waitSeconds} segundos.`
      );
    }

    const user = await this.prisma.usuario.findUnique({
      where: { email },
      include: {
        sede: true,
        sedesPermitidas: {
          include: {
            sede: {
              select: { id: true, codigo: true, nombre: true, ciudad: true },
            },
          },
        },
      },
    });

    if (!user) {
      await this.recordFailedAttempt(email, ipAddress, userAgent, 'Usuario no existe');
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.activo) {
      await this.auditoria.registrar({
        usuarioId: user.id,
        accion: 'LOGIN_BLOQUEADO',
        entidad: 'Usuario',
        entidadId: user.id,
        valoresNuevos: { motivo: 'Cuenta desactivada por administración' },
        ipAddress,
        userAgent,
      });
      throw new UnauthorizedException('El usuario se encuentra desactivado');
    }

    const isMatch = await bcrypt.compare(passwordPlain, user.passwordHash);
    if (!isMatch) {
      await this.recordFailedAttempt(email, ipAddress, userAgent, 'Contraseña incorrecta', user.id);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Limpiar intentos fallidos al tener éxito
    this.failedAttempts.delete(email);

    // Registrar Login Exitoso en Auditoría
    await this.auditoria.registrar({
      usuarioId: user.id,
      accion: 'LOGIN_EXITOSO',
      entidad: 'Usuario',
      entidadId: user.id,
      valoresNuevos: {
        email: user.email,
        rol: user.rol,
        codigoVendedor: user.codigoVendedor,
        sede: user.sede.nombre,
      },
      ipAddress,
      userAgent,
    });

    const payload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      sedeId: user.sedeId,
      codigoVendedor: user.codigoVendedor,
    };

    const token = this.jwtService.sign(payload);

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        nombres: user.nombres,
        apellidos: user.apellidos,
        rol: user.rol,
        codigoVendedor: user.codigoVendedor,
        descuentoMaximo: Number(user.descuentoMaximo),
        accesoTodasSedes: user.accesoTodasSedes,
        sedesPermitidas: user.sedesPermitidas?.map((sp) => sp.sede) || [],
        sede: {
          id: user.sede.id,
          codigo: user.sede.codigo,
          nombre: user.sede.nombre,
          ciudad: user.sede.ciudad,
        },
      },
    };
  }

  private async recordFailedAttempt(
    email: string,
    ipAddress?: string,
    userAgent?: string,
    motivo?: string,
    usuarioId?: string,
  ) {
    const current = this.failedAttempts.get(email) || { count: 0 };
    current.count += 1;

    // A los 5 intentos se bloquea por 15 minutos (900,000 ms)
    if (current.count >= 5) {
      current.blockedUntil = Date.now() + 15 * 60 * 1000;
    }
    this.failedAttempts.set(email, current);

    await this.auditoria.registrar({
      usuarioId,
      accion: 'LOGIN_FALLIDO',
      entidad: 'Usuario',
      entidadId: usuarioId || email,
      valoresNuevos: {
        email,
        motivo,
        intentosFallidos: current.count,
        bloqueado: current.count >= 5,
      },
      ipAddress,
      userAgent,
    });
  }
}
