import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { RolesMgmtService } from './roles-mgmt.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesMgmtController {
  constructor(private rolesMgmtService: RolesMgmtService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  findAllRoles(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('activo') activo?: string,
  ) {
    return this.rolesMgmtService.findAllRoles(req.user, { search, activo });
  }

  @Get('permisos')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  findAllPermisos() {
    return this.rolesMgmtService.findAllPermisos();
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  crearRol(@Body() body: { nombre: string; descripcion?: string; permisoIds: string[] }) {
    return this.rolesMgmtService.crearRol(body);
  }

  @Put(':id')
  @Roles(Role.SUPER_ADMIN)
  editarRol(
    @Param('id') id: string,
    @Body() body: { nombre?: string; descripcion?: string; activo?: boolean; permisoIds?: string[] },
  ) {
    return this.rolesMgmtService.editarRol(id, body);
  }

  @Patch(':id/estado')
  @Roles(Role.SUPER_ADMIN)
  toggleEstadoRol(@Param('id') id: string) {
    return this.rolesMgmtService.toggleEstadoRol(id);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  eliminarRol(@Param('id') id: string) {
    return this.rolesMgmtService.eliminarRol(id);
  }

  @Put(':id/permisos')
  @Roles(Role.SUPER_ADMIN)
  actualizarPermisosRol(@Param('id') id: string, @Body('permisoIds') permisoIds: string[]) {
    return this.rolesMgmtService.actualizarPermisosRol(id, permisoIds);
  }

  @Get('usuario/:id/permisos')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  obtenerPermisosUsuario(@Param('id') id: string) {
    return this.rolesMgmtService.obtenerPermisosEfectivosUsuario(id);
  }

  @Put('usuario/:id/permisos')
  @Roles(Role.SUPER_ADMIN)
  actualizarPermisosUsuario(
    @Param('id') id: string,
    @Body('overrides') overrides: { permisoId: string; concedido: boolean }[],
  ) {
    return this.rolesMgmtService.actualizarPermisosUsuario(id, overrides);
  }
}
