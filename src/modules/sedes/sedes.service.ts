import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function normalizeText(text?: string): string | undefined {
  if (!text) return text;
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

@Injectable()
export class SedesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query?: { search?: string; activo?: string }) {
    const where: any = {};

    if (query?.activo !== undefined && query?.activo !== '') {
      where.activo = query.activo === 'true' || query.activo === '1';
    }

    if (query?.search) {
      const q = query.search.trim();
      where.OR = [
        { codigo: { contains: q, mode: 'insensitive' } },
        { nombre: { contains: q, mode: 'insensitive' } },
        { ciudad: { contains: q, mode: 'insensitive' } },
        { direccion: { contains: q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.sede.findMany({
      where,
      include: {
        _count: {
          select: {
            usuarios: true,
            cotizaciones: true,
            inventario: true,
          },
        },
      },
      orderBy: [{ activo: 'desc' }, { codigo: 'asc' }],
    });
  }

  async findOne(id: string) {
    const sede = await this.prisma.sede.findUnique({
      where: { id },
      include: {
        inventario: {
          include: {
            moto: true,
          },
        },
        _count: {
          select: {
            usuarios: true,
            cotizaciones: true,
          },
        },
      },
    });

    if (!sede) {
      throw new NotFoundException('Sede no encontrada');
    }

    return sede;
  }

  async create(data: {
    codigo: string;
    nombre: string;
    direccion: string;
    ciudad?: string;
    departamento?: string;
    telefono?: string;
    ruc?: string;
  }) {
    const codigoNorm = normalizeText(data.codigo);
    if (!codigoNorm) throw new ConflictException('El código de sede es obligatorio');

    const existing = await this.prisma.sede.findUnique({ where: { codigo: codigoNorm } });
    if (existing) {
      throw new ConflictException(`Ya existe una sede registrada con el código ${codigoNorm}`);
    }

    return this.prisma.sede.create({
      data: {
        codigo: codigoNorm,
        nombre: normalizeText(data.nombre) || codigoNorm,
        direccion: normalizeText(data.direccion) || 'DIRECCION NO REGISTRADA',
        ciudad: normalizeText(data.ciudad) || 'PIURA',
        departamento: normalizeText(data.departamento) || 'PIURA',
        telefono: data.telefono?.trim() || null,
        ruc: data.ruc?.trim() || null,
        activo: true,
      },
    });
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.sede.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sede no encontrada');

    const updateData: any = {};
    if (data.nombre) updateData.nombre = normalizeText(data.nombre);
    if (data.direccion) updateData.direccion = normalizeText(data.direccion);
    if (data.ciudad) updateData.ciudad = normalizeText(data.ciudad);
    if (data.departamento) updateData.departamento = normalizeText(data.departamento);
    if (data.telefono !== undefined) updateData.telefono = data.telefono?.trim() || null;
    if (data.ruc !== undefined) updateData.ruc = data.ruc?.trim() || null;
    if (data.activo !== undefined) updateData.activo = Boolean(data.activo);

    return this.prisma.sede.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.sede.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Sede no encontrada');

    return this.prisma.sede.update({
      where: { id },
      data: { activo: !existing.activo },
    });
  }
}
