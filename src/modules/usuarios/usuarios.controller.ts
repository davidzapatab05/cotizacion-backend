import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsuariosController {
  constructor(private usuariosService: UsuariosService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  async findAll(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('activo') activo?: string,
    @Query('sedeId') sedeId?: string,
  ) {
    return this.usuariosService.findAll(req.user, { search, activo, sedeId });
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  async create(@Request() req: any, @Body() body: any) {
    return this.usuariosService.create(req.user, body);
  }

  @Patch('perfil')
  async updatePerfil(@Request() req: any, @Body() body: any) {
    return this.usuariosService.updatePerfil(req.user.id, body);
  }

  @Post('cambiar-password')
  async cambiarPassword(@Request() req: any, @Body() body: any) {
    return this.usuariosService.cambiarPassword(req.user.id, body);
  }

  @Patch(':id/estado')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  async toggleEstado(@Request() req: any, @Param('id') id: string) {
    return this.usuariosService.toggleEstado(req.user, id);
  }

  @Patch(':id/descuento')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  async updateDescuento(
    @Request() req: any,
    @Param('id') id: string,
    @Body('descuentoMaximo') descuentoMaximo: number,
  ) {
    return this.usuariosService.updateDescuento(req.user, id, Number(descuentoMaximo));
  }

  @Post(':id/reset-password')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  async resetPassword(
    @Request() req: any,
    @Param('id') id: string,
    @Body('password') password: string,
  ) {
    return this.usuariosService.resetPassword(req.user, id, password);
  }

  @Patch(':id/sedes')
  @Roles(Role.SUPER_ADMIN)
  async updateSedesPermitidas(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { accesoTodasSedes: boolean; sedesIds?: string[] },
  ) {
    return this.usuariosService.updateSedesPermitidas(req.user, id, body);
  }
}
