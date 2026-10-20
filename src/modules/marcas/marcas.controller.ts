import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MarcasService } from './marcas.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('marcas')
export class MarcasController {
  constructor(private marcasService: MarcasService) {}

  @Get()
  async findAll(@Query('search') search?: string, @Query('activo') activo?: string) {
    return this.marcasService.findAll({ search, activo });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.marcasService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() body: any) {
    return this.marcasService.create(body);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() body: any) {
    return this.marcasService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    return this.marcasService.remove(id);
  }
}
