import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request, Res } from '@nestjs/common';
import { CotizadorService } from './cotizador.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CalculoCotizacionParams } from './financial-engine.service';
import { CotizacionEstado } from '@prisma/client';

@Controller('cotizaciones')
export class CotizadorController {
  constructor(private cotizadorService: CotizadorService) {}

  @Post('simular')
  simular(@Body() body: CalculoCotizacionParams) {
    return this.cotizadorService.simular(body);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  crear(@Request() req: any, @Body() body: any) {
    return this.cotizadorService.crear(req.user, body);
  }

  @Post('sincronizar-offline')
  @UseGuards(JwtAuthGuard)
  sincronizarLote(@Request() req: any, @Body() body: { items: any[] }) {
    return this.cotizadorService.sincronizarLote(req.user, body.items);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('estado') estado?: CotizacionEstado,
  ) {
    return this.cotizadorService.findAll(req.user, { search, estado });
  }

  @Get('exportar/csv')
  @UseGuards(JwtAuthGuard)
  async exportarCsv(@Request() req: any, @Res() res: any) {
    const csv = await this.cotizadorService.exportarCsv(req.user);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="Cotizaciones_GlobalGo_Piura.csv"',
    });
    res.send('\uFEFF' + csv);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.cotizadorService.findOne(id);
  }

  @Patch(':id/estado')
  @UseGuards(JwtAuthGuard)
  cambiarEstado(
    @Request() req: any,
    @Param('id') id: string,
    @Body('estado') estado: CotizacionEstado,
  ) {
    return this.cotizadorService.cambiarEstado(id, estado, req.user);
  }

  @Patch(':id/firma')
  @UseGuards(JwtAuthGuard)
  guardarFirma(
    @Param('id') id: string,
    @Body('firmaClienteBase64') firmaClienteBase64: string,
  ) {
    return this.cotizadorService.guardarFirma(id, firmaClienteBase64);
  }
}
