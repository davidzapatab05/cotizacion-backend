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
export class MarcasService {
  constructor(private prisma: PrismaService) {}

  async findAll(query?: { search?: string; activo?: string }) {
    const where: any = {};

    if (query?.activo !== undefined && query?.activo !== '') {
      where.activo = query.activo === 'true' || query.activo === '1';
    }

    if (query?.search) {
      where.nombre = { contains: query.search.trim(), mode: 'insensitive' };
    }

    return this.prisma.marca.findMany({
      where,
      include: {
        _count: {
          select: { motos: true },
        },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const marca = await this.prisma.marca.findUnique({
      where: { id },
      include: {
        motos: {
          where: { activo: true },
        },
      },
    });
    if (!marca) throw new NotFoundException('Marca no encontrada');
    return marca;
  }

  async create(data: { nombre: string; paisOrigen?: string; logoUrl?: string }) {
    const nombreNorm = normalizeText(data.nombre);
    if (!nombreNorm) throw new ConflictException('El nombre de la marca es requerido');

    const existing = await this.prisma.marca.findUnique({ where: { nombre: nombreNorm } });
    if (existing) {
      // Si existe y está inactiva, la reactivamos
      if (!existing.activo) {
        return this.prisma.marca.update({
          where: { id: existing.id },
          data: { activo: true, paisOrigen: normalizeText(data.paisOrigen) || existing.paisOrigen },
        });
      }
      return existing;
    }

    return this.prisma.marca.create({
      data: {
        nombre: nombreNorm,
        paisOrigen: normalizeText(data.paisOrigen) || null,
        logoUrl: data.logoUrl || null,
        activo: true,
      },
    });
  }

  async update(id: string, data: { nombre?: string; paisOrigen?: string; logoUrl?: string; activo?: boolean }) {
    const existing = await this.prisma.marca.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Marca no encontrada');

    const updateData: any = {};
    if (data.nombre) updateData.nombre = normalizeText(data.nombre);
    if (data.paisOrigen !== undefined) updateData.paisOrigen = normalizeText(data.paisOrigen) || null;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl || null;
    if (data.activo !== undefined) updateData.activo = Boolean(data.activo);

    return this.prisma.marca.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.marca.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Marca no encontrada');

    return this.prisma.marca.update({
      where: { id },
      data: { activo: !existing.activo },
    });
  }
}
