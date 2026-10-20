import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TipoDocumento } from '@prisma/client';

function normalizeText(text?: string): string | undefined {
  if (!text) return text;
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

@Injectable()
export class ClientesService {
  constructor(private prisma: PrismaService) {}

  async findByNumeroDoc(numeroDoc: string) {
    const docClean = numeroDoc?.trim().toUpperCase();
    return this.prisma.cliente.findUnique({
      where: { numeroDoc: docClean },
      include: {
        cotizaciones: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { 
            moto: { select: { modelo: true, marca: true } },
            sede: { select: { nombre: true, codigo: true } },
          },
        },
      },
    });
  }

  async upsert(data: {
    tipoDocumento?: TipoDocumento;
    numeroDoc: string;
    nombres: string;
    apellidos: string;
    codigoPais?: string;
    telefono: string;
    email?: string;
    direccion?: string;
    ciudad?: string;
  }) {
    const docClean = data.numeroDoc?.trim().toUpperCase();
    const nombresNorm = normalizeText(data.nombres) || '';
    const apellidosNorm = normalizeText(data.apellidos) || '';
    const direccionNorm = normalizeText(data.direccion) || null;
    const ciudadNorm = normalizeText(data.ciudad) || 'PIURA';
    const codigoPaisClean = data.codigoPais?.trim() || '+51';
    const telefonoClean = data.telefono?.trim() || '';

    return this.prisma.cliente.upsert({
      where: { numeroDoc: docClean },
      update: {
        tipoDocumento: data.tipoDocumento ?? TipoDocumento.DNI,
        nombres: nombresNorm,
        apellidos: apellidosNorm,
        codigoPais: codigoPaisClean,
        telefono: telefonoClean,
        email: data.email?.trim().toLowerCase() || null,
        direccion: direccionNorm,
        ciudad: ciudadNorm,
      },
      create: {
        tipoDocumento: data.tipoDocumento ?? TipoDocumento.DNI,
        numeroDoc: docClean,
        nombres: nombresNorm,
        apellidos: apellidosNorm,
        codigoPais: codigoPaisClean,
        telefono: telefonoClean,
        email: data.email?.trim().toLowerCase() || null,
        direccion: direccionNorm,
        ciudad: ciudadNorm,
      },
    });
  }

  async search(query: string) {
    const q = query.trim();
    return this.prisma.cliente.findMany({
      where: {
        OR: [
          { numeroDoc: { contains: q, mode: 'insensitive' } },
          { apellidos: { contains: q, mode: 'insensitive' } },
          { nombres: { contains: q, mode: 'insensitive' } },
          { telefono: { contains: q } },
        ],
      },
      include: {
        _count: { select: { cotizaciones: true } },
      },
      take: 10,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findAll(params?: { search?: string; page?: number; limit?: number }) {
    const page = Number(params?.page) || 1;
    const limit = Number(params?.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params?.search) {
      const q = params.search.trim();
      where.OR = [
        { numeroDoc: { contains: q, mode: 'insensitive' } },
        { apellidos: { contains: q, mode: 'insensitive' } },
        { nombres: { contains: q, mode: 'insensitive' } },
        { telefono: { contains: q } },
      ];
    }

    const [clientes, total] = await Promise.all([
      this.prisma.cliente.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: { select: { cotizaciones: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.cliente.count({ where }),
    ]);

    return {
      data: clientes,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
