import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@Controller('auditoria')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditoriaController {
  constructor(private auditoriaService: AuditoriaService) {}

  @Get('metricas')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  async getMetricas(@Request() req: any) {
    return this.auditoriaService.getMetricas(req.user);
  }

  @Get('logs')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN_SEDE)
  async getLogs(@Request() req: any, @Query('limit') limit?: number) {
    return this.auditoriaService.getLogs(req.user, limit ? Number(limit) : 50);
  }
}
