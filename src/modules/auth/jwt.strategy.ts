import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  rol: string;
  sedeId: string;
  codigoVendedor?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'super-secret-jwt-key-concesionaria-piura-2026',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
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

    if (!user || !user.activo) {
      throw new UnauthorizedException('Usuario no válido o inactivo');
    }

    return user;
  }
}
