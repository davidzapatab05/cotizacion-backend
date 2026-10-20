import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SedesService } from './sedes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('sedes')
export class SedesController {
  constructor(private sedesService: SedesService) {}

  @Get()
  async findAll(@Query('search') search?: string, @Query('activo') activo?: string) {
    return this.sedesService.findAll({ search, activo });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return this.sedesService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async create(@Body() body: any) {
    return this.sedesService.create(body);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async update(@Param('id') id: string, @Body() body: any) {
    return this.sedesService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async remove(@Param('id') id: string) {
    return this.sedesService.remove(id);
  }
}
