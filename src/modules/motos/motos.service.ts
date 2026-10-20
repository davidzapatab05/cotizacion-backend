import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TipoMovimientoStock } from '@prisma/client';

function normalizeText(text?: string): string | undefined {
  if (!text) return text;
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

@Injectable()
export class MotosService {
  constructor(private prisma: PrismaService) {}

  async findAll(query?: { sedeId?: string; search?: string; marca?: string; activo?: string }) {
    const where: any = {};

    if (query?.activo !== undefined && query?.activo !== '') {
      where.activo = query.activo === 'true' || query.activo === '1';
    } else {
      where.activo = true;
    }

    if (query?.marca && query.marca !== 'TODAS') {
      where.marca = { equals: normalizeText(query.marca), mode: 'insensitive' };
    }

    if (query?.search) {
      const q = query.search.trim();
      where.OR = [
        { marca: { contains: q, mode: 'insensitive' } },
        { modelo: { contains: q, mode: 'insensitive' } },
        { version: { contains: q, mode: 'insensitive' } },
      ];
    }

    const motos = await this.prisma.moto.findMany({
      where,
      include: {
        marcaRel: true,
        imagenes: {
          orderBy: { orden: 'asc' },
        },
        inventarioSedes: query?.sedeId
          ? {
              where: { sedeId: query.sedeId },
              include: { sede: true },
            }
          : {
              include: { sede: true },
            },
      },
      orderBy: [{ marca: 'asc' }, { modelo: 'asc' }],
    });

    return motos.map((moto) => {
      const stockTotalSede = moto.inventarioSedes.reduce((acc, curr) => acc + curr.stock, 0);
      return {
        ...moto,
        precioBase: Number(moto.precioBase),
        porcentajeInicialMinima: Number(moto.porcentajeInicialMinima),
        potenciaHp: moto.potenciaHp ? Number(moto.potenciaHp) : null,
        torqueNm: moto.torqueNm ? Number(moto.torqueNm) : null,
        capacidadTanqueGal: moto.capacidadTanqueGal ? Number(moto.capacidadTanqueGal) : null,
        rendimientoKmGal: moto.rendimientoKmGal ? Number(moto.rendimientoKmGal) : null,
        stockTotalSede,
        coloresDisponibles: moto.inventarioSedes.map((inv) => ({
          id: inv.id,
          sedeId: inv.sedeId,
          color: inv.color,
          stock: inv.stock,
          precioSede: inv.precioSede ? Number(inv.precioSede) : null,
        })),
      };
    });
  }

  async findOne(id: string, sedeId?: string) {
    const moto = await this.prisma.moto.findUnique({
      where: { id },
      include: {
        marcaRel: true,
        imagenes: {
          orderBy: { orden: 'asc' },
        },
        inventarioSedes: sedeId
          ? {
              where: { sedeId },
              include: { 
                sede: true,
                movimientos: {
                  orderBy: { createdAt: 'desc' },
                  take: 10,
                  include: { usuario: { select: { nombres: true, apellidos: true } } },
                },
              },
            }
          : {
              include: { 
                sede: true,
                movimientos: {
                  orderBy: { createdAt: 'desc' },
                  take: 10,
                  include: { usuario: { select: { nombres: true, apellidos: true } } },
                },
              },
            },
      },
    });

    if (!moto) {
      throw new NotFoundException('Motocicleta no encontrada');
    }

    const stockTotalSede = moto.inventarioSedes.reduce((acc, curr) => acc + curr.stock, 0);

    return {
      ...moto,
      precioBase: Number(moto.precioBase),
      porcentajeInicialMinima: Number(moto.porcentajeInicialMinima),
      potenciaHp: moto.potenciaHp ? Number(moto.potenciaHp) : null,
      torqueNm: moto.torqueNm ? Number(moto.torqueNm) : null,
      capacidadTanqueGal: moto.capacidadTanqueGal ? Number(moto.capacidadTanqueGal) : null,
      rendimientoKmGal: moto.rendimientoKmGal ? Number(moto.rendimientoKmGal) : null,
      stockTotalSede,
      coloresDisponibles: moto.inventarioSedes.map((inv) => ({
        id: inv.id,
        sedeId: inv.sedeId,
        color: inv.color,
        stock: inv.stock,
        precioSede: inv.precioSede ? Number(inv.precioSede) : null,
      })),
    };
  }

  async create(data: {
    marca: string;
    marcaId?: string;
    modelo: string;
    version?: string;
    anio?: number;
    cilindradaCc: number;
    tipoMotor?: string;
    potenciaHp?: number;
    torqueNm?: number;
    sistemaFrenos?: string;
    capacidadTanqueGal?: number;
    rendimientoKmGal?: number;
    fichaTecnicaUrl?: string;
    precioBase: number;
    porcentajeInicialMinima?: number;
    imagenes?: string[];
    inventarioInicial?: { sedeId: string; color: string; stock: number }[];
    usuarioId?: string;
  }) {
    const marcaNorm = normalizeText(data.marca) || 'GENERICA';
    
    // Vincular o crear marca normalizada
    let marcaRecord = data.marcaId 
      ? await this.prisma.marca.findUnique({ where: { id: data.marcaId } })
      : await this.prisma.marca.findUnique({ where: { nombre: marcaNorm } });

    if (!marcaRecord) {
      marcaRecord = await this.prisma.marca.create({
        data: { nombre: marcaNorm, activo: true },
      });
    }

    const moto = await this.prisma.moto.create({
      data: {
        marca: marcaNorm,
        marcaId: marcaRecord.id,
        modelo: normalizeText(data.modelo) || 'MODELO',
        version: normalizeText(data.version),
        anio: data.anio ? Number(data.anio) : 2026,
        cilindradaCc: Number(data.cilindradaCc),
        tipoMotor: normalizeText(data.tipoMotor),
        potenciaHp: data.potenciaHp !== undefined && data.potenciaHp !== null ? Number(data.potenciaHp) : null,
        torqueNm: data.torqueNm !== undefined && data.torqueNm !== null ? Number(data.torqueNm) : null,
        sistemaFrenos: normalizeText(data.sistemaFrenos),
        capacidadTanqueGal: data.capacidadTanqueGal !== undefined && data.capacidadTanqueGal !== null ? Number(data.capacidadTanqueGal) : null,
        rendimientoKmGal: data.rendimientoKmGal !== undefined && data.rendimientoKmGal !== null ? Number(data.rendimientoKmGal) : null,
        fichaTecnicaUrl: data.fichaTecnicaUrl,
        precioBase: Number(data.precioBase),
        porcentajeInicialMinima: data.porcentajeInicialMinima ? Number(data.porcentajeInicialMinima) : 30.00,
        imagenes: {
          create: (data.imagenes || []).map((url, idx) => ({
            url,
            esPrincipal: idx === 0,
            orden: idx,
          })),
        },
        inventarioSedes: {
          create: (data.inventarioInicial || []).map((inv) => ({
            sedeId: inv.sedeId,
            color: normalizeText(inv.color) || 'NEGRO',
            stock: Number(inv.stock) || 0,
          })),
        },
      },
      include: {
        imagenes: true,
        inventarioSedes: true,
      },
    });

    // Registrar en Kardex de stock para cada inventario inicial creado > 0
    for (const inv of moto.inventarioSedes) {
      if (inv.stock > 0) {
        await this.prisma.movimientoStock.create({
          data: {
            inventarioId: inv.id,
            tipo: TipoMovimientoStock.INGRESO_LOTE,
            cantidad: inv.stock,
            stockAnterior: 0,
            stockNuevo: inv.stock,
            motivo: `STOCK INICIAL DE LANZAMIENTO - ${inv.color}`,
            usuarioId: data.usuarioId || null,
          },
        });
      }
    }

    return moto;
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.moto.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Motocicleta no encontrada');

    let marcaNorm = existing.marca;
    let marcaId = existing.marcaId;

    if (data.marca) {
      marcaNorm = normalizeText(data.marca) || existing.marca;
      let marcaRecord = await this.prisma.marca.findUnique({ where: { nombre: marcaNorm } });
      if (!marcaRecord) {
        marcaRecord = await this.prisma.marca.create({ data: { nombre: marcaNorm, activo: true } });
      }
      marcaId = marcaRecord.id;
    }

    await this.prisma.moto.update({
      where: { id },
      data: {
        marca: marcaNorm,
        marcaId,
        modelo: normalizeText(data.modelo) || existing.modelo,
        version: normalizeText(data.version) ?? existing.version,
        anio: data.anio ? Number(data.anio) : existing.anio,
        cilindradaCc: data.cilindradaCc ? Number(data.cilindradaCc) : existing.cilindradaCc,
        tipoMotor: normalizeText(data.tipoMotor) ?? existing.tipoMotor,
        potenciaHp: data.potenciaHp !== undefined && data.potenciaHp !== null ? Number(data.potenciaHp) : existing.potenciaHp,
        torqueNm: data.torqueNm !== undefined && data.torqueNm !== null ? Number(data.torqueNm) : existing.torqueNm,
        sistemaFrenos: normalizeText(data.sistemaFrenos) ?? existing.sistemaFrenos,
        capacidadTanqueGal: data.capacidadTanqueGal !== undefined && data.capacidadTanqueGal !== null ? Number(data.capacidadTanqueGal) : existing.capacidadTanqueGal,
        rendimientoKmGal: data.rendimientoKmGal !== undefined && data.rendimientoKmGal !== null ? Number(data.rendimientoKmGal) : existing.rendimientoKmGal,
        fichaTecnicaUrl: data.fichaTecnicaUrl ?? existing.fichaTecnicaUrl,
        precioBase: data.precioBase !== undefined ? Number(data.precioBase) : existing.precioBase,
        porcentajeInicialMinima: data.porcentajeInicialMinima !== undefined ? Number(data.porcentajeInicialMinima) : existing.porcentajeInicialMinima,
      },
    });

    // Actualizar inventario si se envía
    if (data.coloresDisponibles && Array.isArray(data.coloresDisponibles)) {
      const sedePiura = await this.prisma.sede.findFirst({ where: { codigo: 'PIU-01' } });
      const targetSedeId = data.sedeId || (sedePiura ? sedePiura.id : null);
      if (targetSedeId) {
        for (const c of data.coloresDisponibles) {
          const colorNorm = normalizeText(c.color) || 'NEGRO';
          const newStock = Number(c.stock) || 0;

          const inv = await this.prisma.inventarioSede.findUnique({
            where: {
              sedeId_motoId_color: {
                sedeId: targetSedeId,
                motoId: id,
                color: colorNorm,
              },
            },
          });

          if (inv) {
            const diff = newStock - inv.stock;
            if (diff !== 0) {
              await this.prisma.inventarioSede.update({
                where: { id: inv.id },
                data: { stock: newStock },
              });
              await this.prisma.movimientoStock.create({
                data: {
                  inventarioId: inv.id,
                  tipo: diff > 0 ? TipoMovimientoStock.INGRESO_LOTE : TipoMovimientoStock.AJUSTE_INVENTARIO,
                  cantidad: Math.abs(diff),
                  stockAnterior: inv.stock,
                  stockNuevo: newStock,
                  motivo: 'ACTUALIZACION DESDE EDICION DE CATALOGO',
                  usuarioId: data.usuarioId || null,
                },
              });
            }
          } else {
            const newInv = await this.prisma.inventarioSede.create({
              data: {
                motoId: id,
                sedeId: targetSedeId,
                color: colorNorm,
                stock: newStock,
              },
            });
            if (newStock > 0) {
              await this.prisma.movimientoStock.create({
                data: {
                  inventarioId: newInv.id,
                  tipo: TipoMovimientoStock.INGRESO_LOTE,
                  cantidad: newStock,
                  stockAnterior: 0,
                  stockNuevo: newStock,
                  motivo: 'COLOR NUEVO AGREGADO EN CATALOGO',
                  usuarioId: data.usuarioId || null,
                },
              });
            }
          }
        }
      }
    }

    // Actualizar imagen si se envía
    if (data.imagenes && Array.isArray(data.imagenes) && data.imagenes.length > 0) {
      await this.prisma.motoImagen.deleteMany({ where: { motoId: id } });
      await this.prisma.motoImagen.createMany({
        data: data.imagenes.map((url: string, idx: number) => ({
          motoId: id,
          url,
          esPrincipal: idx === 0,
          orden: idx,
        })),
      });
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    const existing = await this.prisma.moto.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Motocicleta no encontrada');

    return this.prisma.moto.update({
      where: { id },
      data: { activo: false },
    });
  }

  async getMarcas() {
    return this.prisma.marca.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  // --- KARDEX Y CONTROL DE MOVIMIENTOS DE STOCK ---
  async registrarMovimientoStock(dto: {
    inventarioId: string;
    tipo: TipoMovimientoStock;
    cantidad: number;
    motivo: string;
    usuarioId?: string;
  }) {
    if (!dto.cantidad || dto.cantidad <= 0) {
      throw new BadRequestException('La cantidad del movimiento debe ser mayor a 0');
    }

    const inv = await this.prisma.inventarioSede.findUnique({
      where: { id: dto.inventarioId },
      include: { moto: true, sede: true },
    });

    if (!inv) throw new NotFoundException('Inventario de sede no encontrado');

    const stockAnterior = inv.stock;
    let stockNuevo = stockAnterior;

    switch (dto.tipo) {
      case TipoMovimientoStock.INGRESO_LOTE:
      case TipoMovimientoStock.DEVOLUCION_DEFECTO:
        stockNuevo = stockAnterior + dto.cantidad;
        break;
      case TipoMovimientoStock.VENTA_ENTREGA:
        if (stockAnterior < dto.cantidad) {
          throw new BadRequestException(`Stock insuficiente. Stock actual: ${stockAnterior}, requerido: ${dto.cantidad}`);
        }
        stockNuevo = stockAnterior - dto.cantidad;
        break;
      case TipoMovimientoStock.AJUSTE_INVENTARIO:
        stockNuevo = dto.cantidad; // En ajuste se asume fijar el valor auditado
        break;
      default:
        stockNuevo = stockAnterior + dto.cantidad;
    }

    const motivoNorm = normalizeText(dto.motivo) || 'MOVIMIENTO MANUAL DE STOCK';

    // Ejecución atómica en transacción
    const [updatedInv, movimiento] = await this.prisma.$transaction([
      this.prisma.inventarioSede.update({
        where: { id: dto.inventarioId },
        data: { stock: stockNuevo },
      }),
      this.prisma.movimientoStock.create({
        data: {
          inventarioId: dto.inventarioId,
          tipo: dto.tipo,
          cantidad: dto.cantidad,
          stockAnterior,
          stockNuevo,
          motivo: motivoNorm,
          usuarioId: dto.usuarioId || null,
        },
        include: {
          usuario: {
            select: { nombres: true, apellidos: true, email: true },
          },
        },
      }),
    ]);

    return {
      inventario: updatedInv,
      movimiento,
    };
  }

  async getKardexPorInventario(inventarioId: string) {
    const inv = await this.prisma.inventarioSede.findUnique({
      where: { id: inventarioId },
      include: {
        moto: true,
        sede: true,
        movimientos: {
          orderBy: { createdAt: 'desc' },
          include: {
            usuario: { select: { nombres: true, apellidos: true } },
          },
        },
      },
    });

    if (!inv) throw new NotFoundException('Registro de inventario no encontrado');
    return inv;
  }

  async getKardexPorMoto(motoId: string, sedeId?: string) {
    const where: any = { motoId };
    if (sedeId) where.sedeId = sedeId;

    const inventarios = await this.prisma.inventarioSede.findMany({
      where,
      include: {
        sede: true,
        movimientos: {
          orderBy: { createdAt: 'desc' },
          include: {
            usuario: { select: { nombres: true, apellidos: true } },
          },
        },
      },
    });

    return inventarios;
  }
}
