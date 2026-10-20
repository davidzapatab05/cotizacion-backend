import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CotizacionEstado, Role } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getAnalytics(user: any) {
    const isSuperAdmin = user.rol === Role.SUPER_ADMIN;
    const whereSede: any = isSuperAdmin ? {} : { sedeId: user.sedeId };

    // 1. Cotizaciones del mes
    const cotizaciones = await this.prisma.cotizacion.findMany({
      where: whereSede,
      include: {
        moto: true,
        vendedor: true,
        cliente: true,
      },
    });

    const totalCotizado = cotizaciones.reduce((acc, c) => acc + Number(c.precioFinalVenta), 0);
    const totalIniciales = cotizaciones.reduce((acc, c) => acc + Number(c.montoInicial), 0);
    const totalFinanciado = cotizaciones.reduce((acc, c) => acc + Number(c.saldoAFinanciar), 0);

    // Conteo por estados (Pipeline de Ventas)
    const porEstado = {
      emitidas: cotizaciones.filter((c) => c.estado === CotizacionEstado.EMITIDA).length,
      borradores: cotizaciones.filter((c) => c.estado === CotizacionEstado.BORRADOR).length,
      aprobadas: cotizaciones.filter((c) => c.estado === CotizacionEstado.APROBADA).length,
      ventasConcretadas: cotizaciones.filter((c) => c.estado === CotizacionEstado.CONVERTIDA_A_VENTA).length,
      rechazadas: cotizaciones.filter((c) => c.estado === CotizacionEstado.RECHAZADA).length,
    };

    // Ventas concretadas monto
    const montoVentasCerradas = cotizaciones
      .filter((c) => c.estado === CotizacionEstado.CONVERTIDA_A_VENTA)
      .reduce((acc, c) => acc + Number(c.precioFinalVenta), 0);

    // Tasa de conversión
    const tasaConversion = cotizaciones.length > 0
      ? Math.round((porEstado.ventasConcretadas / cotizaciones.length) * 100)
      : 0;

    // 2. Ranking de Vendedores (Leaderboard)
    const vendedoresMap = new Map<string, { id: string; nombre: string; codigo: string; totalCotizaciones: number; volumenSoles: number; ventasCerradas: number }>();

    for (const c of cotizaciones) {
      const v = c.vendedor;
      if (!v) continue;
      const prev = vendedoresMap.get(v.id) || {
        id: v.id,
        nombre: `${v.nombres} ${v.apellidos}`,
        codigo: v.codigoVendedor || 'S/C',
        totalCotizaciones: 0,
        volumenSoles: 0,
        ventasCerradas: 0,
      };

      prev.totalCotizaciones += 1;
      prev.volumenSoles += Number(c.precioFinalVenta);
      if (c.estado === CotizacionEstado.CONVERTIDA_A_VENTA) {
        prev.ventasCerradas += 1;
      }
      vendedoresMap.set(v.id, prev);
    }

    const leaderboard = Array.from(vendedoresMap.values()).sort((a, b) => b.volumenSoles - a.volumenSoles);

    // 3. Modelos más cotizados
    const motosMap = new Map<string, { id: string; marca: string; modelo: string; count: number; precioBase: number }>();
    for (const c of cotizaciones) {
      const m = c.moto;
      if (!m) continue;
      const prev = motosMap.get(m.id) || {
        id: m.id,
        marca: m.marca,
        modelo: m.modelo,
        count: 0,
        precioBase: Number(m.precioBase),
      };
      prev.count += 1;
      motosMap.set(m.id, prev);
    }

    const topMotos = Array.from(motosMap.values()).sort((a, b) => b.count - a.count);

    // 4. Meta de la Sede Piura (ej. S/ 150,000 mensual)
    const metaMensualSede = 150000;
    const porcentajeMeta = Math.min(100, Math.round((totalCotizado / metaMensualSede) * 100));

    return {
      kpis: {
        totalCotizaciones: cotizaciones.length,
        totalCotizadoSoles: totalCotizado,
        totalInicialesRecaudadas: totalIniciales,
        totalSaldoFinanciado: totalFinanciado,
        montoVentasCerradas,
        tasaConversion,
        metaMensualSede,
        porcentajeMeta,
      },
      pipeline: porEstado,
      leaderboard,
      topMotos,
    };
  }
}
