import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FinancialEngineService, CalculoCotizacionParams } from './financial-engine.service';
import { CotizacionEstado, Role, TipoDocumento } from '@prisma/client';

function normalizeText(text?: string): string | undefined {
  if (!text) return text;
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

@Injectable()
export class CotizadorService {
  constructor(
    private prisma: PrismaService,
    private financialEngine: FinancialEngineService,
  ) {}

  simular(params: CalculoCotizacionParams) {
    return this.financialEngine.calcular(params);
  }

  async crear(
    user: any,
    dto: {
      motoId: string;
      colorSeleccionado?: string;
      cliente: {
        tipoDocumento?: TipoDocumento;
        numeroDoc: string;
        nombres: string;
        apellidos: string;
        codigoPais?: string;
        telefono: string;
        email?: string;
        direccion?: string;
      };
      descuento?: number;
      montoInicial?: number;
      porcentajeInicial?: number;
      plazoMeses: number;
      observaciones?: string;
      uuidLocalOffline?: string;
      totalAdicionales?: number;
      adicionalesJson?: any;
      firmaClienteBase64?: string;
    },
  ) {
    const moto = await this.prisma.moto.findUnique({
      where: { id: dto.motoId },
    });

    if (!moto || !moto.activo) {
      throw new NotFoundException('Motocicleta no disponible para cotización');
    }

    const precioBase = Number(moto.precioBase);
    const porcentajeInicialMinima = Number(moto.porcentajeInicialMinima);
    const descuento = dto.descuento ? Number(dto.descuento) : 0;

    // Validación de RBAC de descuento
    const maxDescuentoMonto = (precioBase * Number(user.descuentoMaximo)) / 100;
    let estado: CotizacionEstado = CotizacionEstado.EMITIDA;
    let aprobadoPorId: string | null = null;

    if (descuento > maxDescuentoMonto && user.rol === Role.VENDEDOR) {
      // Si el descuento excede el límite del vendedor, queda como borrador pendiente de aprobación
      estado = CotizacionEstado.BORRADOR;
    } else if (descuento > 0 && (user.rol === Role.ADMIN_SEDE || user.rol === Role.SUPER_ADMIN)) {
      aprobadoPorId = user.id;
    }

    // Cálculo con el motor financiero
    const calculo = this.financialEngine.calcular({
      precioBase,
      descuento,
      montoInicial: dto.montoInicial,
      porcentajeInicial: dto.porcentajeInicial,
      plazoMeses: dto.plazoMeses,
      porcentajeInicialMinimo: porcentajeInicialMinima,
    });

    // Upsert cliente (Normalizado en Mayúsculas sin tildes)
    const docClean = dto.cliente.numeroDoc?.trim().toUpperCase();
    const cliente = await this.prisma.cliente.upsert({
      where: { numeroDoc: docClean },
      update: {
        tipoDocumento: dto.cliente.tipoDocumento ?? TipoDocumento.DNI,
        nombres: normalizeText(dto.cliente.nombres) || dto.cliente.nombres,
        apellidos: normalizeText(dto.cliente.apellidos) || dto.cliente.apellidos,
        codigoPais: dto.cliente.codigoPais?.trim() || '+51',
        telefono: dto.cliente.telefono?.trim(),
        email: dto.cliente.email ? dto.cliente.email.trim().toLowerCase() : undefined,
        direccion: normalizeText(dto.cliente.direccion) || dto.cliente.direccion,
      },
      create: {
        tipoDocumento: dto.cliente.tipoDocumento ?? TipoDocumento.DNI,
        numeroDoc: docClean,
        nombres: normalizeText(dto.cliente.nombres) || dto.cliente.nombres,
        apellidos: normalizeText(dto.cliente.apellidos) || dto.cliente.apellidos,
        codigoPais: dto.cliente.codigoPais?.trim() || '+51',
        telefono: dto.cliente.telefono?.trim(),
        email: dto.cliente.email ? dto.cliente.email.trim().toLowerCase() : undefined,
        direccion: normalizeText(dto.cliente.direccion) || dto.cliente.direccion,
      },
    });

    // Generar correlativo oficial por Sede (ej: COT-PIU-2026-00001)
    const sede = await this.prisma.sede.findUnique({ where: { id: user.sedeId } });
    const codigoSede = sede?.codigo?.split('-')[0] || 'PIU';
    const anioActual = new Date().getFullYear();

    const countCotizacionesSede = await this.prisma.cotizacion.count({
      where: { sedeId: user.sedeId },
    });
    const correlativo = `COT-${codigoSede}-${anioActual}-${String(countCotizacionesSede + 1).padStart(5, '0')}`;

    // Vigencia: 15 días calendario
    const fechaVigencia = new Date();
    fechaVigencia.setDate(fechaVigencia.getDate() + 15);

    const cotizacion = await this.prisma.cotizacion.create({
      data: {
        correlativoSede: correlativo,
        sedeId: user.sedeId,
        vendedorId: user.id,
        aprobadoPorId,
        clienteId: cliente.id,
        motoId: moto.id,
        colorSeleccionado: dto.colorSeleccionado,
        precioListaMoto: calculo.precioLista,
        descuentoMonto: calculo.descuento,
        precioFinalVenta: calculo.precioFinal,
        montoInicial: calculo.montoInicial,
        porcentajeInicial: calculo.porcentajeInicial,
        saldoAFinanciar: calculo.saldoAFinanciar,
        plazoMeses: calculo.plazoMeses,
        periodicidad: calculo.periodicidad,
        cuotaEstimada: calculo.cuotaSemanal,
        costoFijoSemanal: calculo.costoFijoSemanal,
        tasaFactorAplicada: calculo.factorVariable,
        totalAdicionales: dto.totalAdicionales ? Number(dto.totalAdicionales) : 0,
        adicionalesJson: dto.adicionalesJson ? (typeof dto.adicionalesJson === 'string' ? dto.adicionalesJson : JSON.stringify(dto.adicionalesJson)) : null,
        firmaClienteBase64: dto.firmaClienteBase64 || null,
        estado,
        observaciones: dto.observaciones,
        fechaVigencia,
        sincronizadoOffline: true,
        uuidLocalOffline: dto.uuidLocalOffline,
      },
      include: {
        sede: true,
        vendedor: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            codigoVendedor: true,
            email: true,
            telefono: true,
          },
        },
        cliente: true,
        moto: {
          include: {
            imagenes: true,
          },
        },
      },
    });

    // Registro en auditoría
    await this.prisma.auditoria.create({
      data: {
        usuarioId: user.id,
        accion: 'COTIZACION_CREADA',
        entidad: 'Cotizacion',
        entidadId: cotizacion.id,
        valoresNuevos: {
          correlativo: cotizacion.correlativoSede,
          precioFinal: calculo.precioFinal,
          inicial: calculo.montoInicial,
          cuotaSemanal: calculo.cuotaSemanal,
          plazoMeses: calculo.plazoMeses,
        },
      },
    });

    return cotizacion;
  }

  async sincronizarLote(user: any, items: any[]) {
    const resultados = [];
    for (const item of items) {
      try {
        // Verificar si ya fue sincronizado por uuidLocalOffline
        if (item.uuidLocalOffline) {
          const existente = await this.prisma.cotizacion.findUnique({
            where: { uuidLocalOffline: item.uuidLocalOffline },
          });
          if (existente) {
            resultados.push({ uuidLocal: item.uuidLocalOffline, id: existente.id, status: 'ALREADY_SYNCED' });
            continue;
          }
        }
        const creada = await this.crear(user, item);
        resultados.push({ uuidLocal: item.uuidLocalOffline, id: creada.id, correlativo: creada.correlativoSede, status: 'SUCCESS' });
      } catch (err: any) {
        resultados.push({ uuidLocal: item.uuidLocalOffline, error: err.message, status: 'ERROR' });
      }
    }
    return resultados;
  }

  async findAll(user: any, query?: { search?: string; estado?: CotizacionEstado }) {
    const where: any = {};

    // Filtro por rol / Sede
    if (user.rol === Role.VENDEDOR) {
      where.vendedorId = user.id;
    } else if (user.rol === Role.ADMIN_SEDE) {
      where.sedeId = user.sedeId;
    }

    if (query?.estado) {
      where.estado = query.estado;
    }

    if (query?.search) {
      where.OR = [
        { correlativoSede: { contains: query.search, mode: 'insensitive' } },
        { cliente: { numeroDoc: { contains: query.search } } },
        { cliente: { apellidos: { contains: query.search, mode: 'insensitive' } } },
        { moto: { modelo: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.cotizacion.findMany({
      where,
      include: {
        sede: true,
        vendedor: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            codigoVendedor: true,
          },
        },
        cliente: true,
        moto: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async findOne(id: string) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id },
      include: {
        sede: true,
        vendedor: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            codigoVendedor: true,
            email: true,
            telefono: true,
          },
        },
        cliente: true,
        moto: {
          include: {
            imagenes: true,
          },
        },
      },
    });

    if (!cotizacion) {
      throw new NotFoundException('Cotización no encontrada');
    }

    return cotizacion;
  }

  async cambiarEstado(id: string, nuevoEstado: CotizacionEstado, user: any) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id },
      include: { moto: true },
    });
    if (!cotizacion) throw new NotFoundException('Cotización no encontrada');

    if (nuevoEstado === CotizacionEstado.CONVERTIDA_A_VENTA && cotizacion.estado !== CotizacionEstado.CONVERTIDA_A_VENTA) {
      if (cotizacion.colorSeleccionado) {
        const inv = await this.prisma.inventarioSede.findFirst({
          where: {
            sedeId: cotizacion.sedeId,
            motoId: cotizacion.motoId,
            color: cotizacion.colorSeleccionado,
          },
        });
        if (inv && inv.stock > 0) {
          await this.prisma.inventarioSede.update({
            where: { id: inv.id },
            data: { stock: inv.stock - 1 },
          });
          await this.prisma.movimientoStock.create({
            data: {
              inventarioId: inv.id,
              tipo: 'VENTA_ENTREGA',
              cantidad: 1,
              stockAnterior: inv.stock,
              stockNuevo: inv.stock - 1,
              motivo: `VENTA CONCRETADA SEGUN COTIZACION ${cotizacion.correlativoSede}`,
              usuarioId: user.id,
            },
          });
        }
      }
    }

    const updated = await this.prisma.cotizacion.update({
      where: { id },
      data: {
        estado: nuevoEstado,
        ...(nuevoEstado === CotizacionEstado.APROBADA ? { aprobadoPorId: user.id } : {}),
      },
    });

    await this.prisma.auditoria.create({
      data: {
        usuarioId: user.id,
        accion: `COTIZACION_ESTADO_${nuevoEstado}`,
        entidad: 'Cotizacion',
        entidadId: id,
        valoresPrevios: { estado: cotizacion.estado },
        valoresNuevos: { estado: nuevoEstado },
      },
    });

    return updated;
  }

  async exportarCsv(user: any): Promise<string> {
    const cotizaciones = await this.findAll(user);
    const headers = [
      'Correlativo',
      'Fecha',
      'Cliente',
      'Documento',
      'Telefono',
      'Moto',
      'Color',
      'Precio Final (S/)',
      'Inicial (S/)',
      'Saldo (S/)',
      'Plazo (Meses)',
      'Cuota Semanal (S/)',
      'Vendedor',
      'Estado',
    ];

    const rows = cotizaciones.map((c: any) => [
      c.correlativoSede,
      new Date(c.createdAt).toLocaleDateString('es-PE'),
      `"${c.cliente?.nombres} ${c.cliente?.apellidos}"`,
      c.cliente?.numeroDoc,
      c.cliente?.telefono,
      `"${c.moto?.marca} ${c.moto?.modelo}"`,
      `"${c.colorSeleccionado || ''}"`,
      Number(c.precioFinalVenta).toFixed(2),
      Number(c.montoInicial).toFixed(2),
      Number(c.saldoAFinanciar).toFixed(2),
      c.plazoMeses,
      Number(c.cuotaEstimada).toFixed(2),
      c.vendedor?.codigoVendedor || c.vendedor?.nombres,
      c.estado,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  async guardarFirma(id: string, firmaBase64: string) {
    const cot = await this.prisma.cotizacion.findUnique({ where: { id } });
    if (!cot) throw new NotFoundException('Cotización no encontrada');
    return this.prisma.cotizacion.update({
      where: { id },
      data: { firmaClienteBase64: firmaBase64 },
    });
  }
}
