import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { MotosService } from './motos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('motos')
export class MotosController {
  constructor(private motosService: MotosService) {}

  @Get()
  async findAll(
    @Query('sedeId') sedeId?: string,
    @Query('search') search?: string,
    @Query('marca') marca?: string,
    @Query('activo') activo?: string,
  ) {
    return this.motosService.findAll({ sedeId, search, marca, activo });
  }

  @Get('marcas')
  async getMarcas() {
    return this.motosService.getMarcas();
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Query('sedeId') sedeId?: string) {
    return this.motosService.findOne(id, sedeId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  async create(@Body() body: any, @Request() req: any) {
    return this.motosService.create({
      ...body,
      usuarioId: req.user?.id,
    });
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.motosService.update(id, {
      ...body,
      usuarioId: req.user?.id,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  async remove(@Param('id') id: string) {
    return this.motosService.remove(id);
  }

  // --- KARDEX Y MOVIMIENTOS DE STOCK ---
  @Post('inventario/movimiento')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE, Role.VENDEDOR)
  async registrarMovimiento(@Body() body: any, @Request() req: any) {
    return this.motosService.registrarMovimientoStock({
      inventarioId: body.inventarioId,
      tipo: body.tipo,
      cantidad: Number(body.cantidad),
      motivo: body.motivo,
      usuarioId: req.user?.id,
    });
  }

  @Get('inventario/:inventarioId/kardex')
  @UseGuards(JwtAuthGuard)
  async getKardexInventario(@Param('inventarioId') inventarioId: string) {
    return this.motosService.getKardexPorInventario(inventarioId);
  }

  @Get(':id/kardex')
  @UseGuards(JwtAuthGuard)
  async getKardexMoto(@Param('id') id: string, @Query('sedeId') sedeId?: string) {
    return this.motosService.getKardexPorMoto(id, sedeId);
  }
}
