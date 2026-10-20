import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('clientes')
@UseGuards(JwtAuthGuard)
export class ClientesController {
  constructor(private clientesService: ClientesService) {}

  @Get()
  async findAll(@Query('search') search?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.clientesService.findAll({ search, page: Number(page) || 1, limit: Number(limit) || 20 });
  }

  @Get('buscar')
  async search(@Query('q') q: string) {
    if (!q) return [];
    return this.clientesService.search(q);
  }

  @Get('documento/:numeroDoc')
  async findByNumeroDoc(@Param('numeroDoc') numeroDoc: string) {
    return this.clientesService.findByNumeroDoc(numeroDoc);
  }

  @Post()
  async upsert(@Body() body: any) {
    return this.clientesService.upsert(body);
  }
}
