import { Controller, Post, Body, Get, UseGuards, Request, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Request as ExpressRequest } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Req() req: ExpressRequest,
  ) {
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Desconocido';
    return this.authService.login(body.email, body.password, ipAddress, userAgent);
  }

  @Get('perfil')
  @UseGuards(JwtAuthGuard)
  getPerfil(@Request() req: any) {
    return {
      id: req.user.id,
      email: req.user.email,
      nombres: req.user.nombres,
      apellidos: req.user.apellidos,
      rol: req.user.rol,
      codigoVendedor: req.user.codigoVendedor,
      descuentoMaximo: Number(req.user.descuentoMaximo),
      accesoTodasSedes: req.user.accesoTodasSedes,
      sedesPermitidas: req.user.sedesPermitidas?.map((sp: any) => sp.sede) || [],
      sede: {
        id: req.user.sede.id,
        codigo: req.user.sede.codigo,
        nombre: req.user.sede.nombre,
        ciudad: req.user.sede.ciudad,
      },
    };
  }
}
