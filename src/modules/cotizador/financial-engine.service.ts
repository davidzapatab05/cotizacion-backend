import { Injectable, BadRequestException } from '@nestjs/common';

export interface CalculoCotizacionParams {
  precioBase: number;
  descuento?: number;
  montoInicial?: number;
  porcentajeInicial?: number;
  plazoMeses: number; // 12, 18, 24
  porcentajeInicialMinimo?: number; // ej: 30%
}

export interface ResultadoCalculo {
  precioLista: number;
  descuento: number;
  precioFinal: number;
  montoInicial: number;
  porcentajeInicial: number;
  saldoAFinanciar: number;
  plazoMeses: number;
  totalSemanas: number;
  periodicidad: 'SEMANAL';
  factorVariable: number;
  costoFijoSemanal: number;
  cuotaSemanal: number;
  cuotaMensualEstimada: number;
  totalFinanciado: number;
  interesTotalEstimado: number;
}

@Injectable()
export class FinancialEngineService {
  // Factores calibrados contra los datos observados de Global Go (Piura)
  // Fórmula: CuotaSemanal = (Saldo * factor) + costoFijoSemanal (GPS + Seguro)
  private readonly defaultRates: Record<number, { factor: number; costoFijo: number; semanas: number }> = {
    12: { factor: 0.0285714, costoFijo: 5.47, semanas: 48 },
    18: { factor: 0.0223333, costoFijo: 4.11, semanas: 72 },
    24: { factor: 0.0192381, costoFijo: 3.88, semanas: 96 },
  };

  calcular(params: CalculoCotizacionParams): ResultadoCalculo {
    const {
      precioBase,
      descuento = 0,
      plazoMeses,
      porcentajeInicialMinimo = 30,
    } = params;

    if (precioBase <= 0) {
      throw new BadRequestException('El precio base debe ser mayor a 0');
    }

    if (descuento < 0 || descuento >= precioBase) {
      throw new BadRequestException('El descuento ingresado no es válido');
    }

    const configPlazo = this.defaultRates[plazoMeses];
    if (!configPlazo) {
      throw new BadRequestException(`Plazo no soportado: ${plazoMeses} meses. Use 12, 18 o 24.`);
    }

    const precioFinal = Math.round((precioBase - descuento) * 100) / 100;
    const inicialMinimaRequerida = Math.round(precioFinal * (porcentajeInicialMinimo / 100) * 100) / 100;

    let montoInicialEfectivo = 0;
    let porcentajeInicialEfectivo = 0;

    if (params.montoInicial !== undefined && params.montoInicial > 0) {
      montoInicialEfectivo = Math.round(params.montoInicial * 100) / 100;
      porcentajeInicialEfectivo = Math.round((montoInicialEfectivo / precioFinal) * 10000) / 100;
    } else if (params.porcentajeInicial !== undefined && params.porcentajeInicial > 0) {
      porcentajeInicialEfectivo = Math.round(params.porcentajeInicial * 100) / 100;
      montoInicialEfectivo = Math.round(precioFinal * (porcentajeInicialEfectivo / 100) * 100) / 100;
    } else {
      // Por defecto la inicial mínima requerida
      montoInicialEfectivo = inicialMinimaRequerida;
      porcentajeInicialEfectivo = porcentajeInicialMinimo;
    }

    // Validación estricta de regla de negocio
    if (montoInicialEfectivo < inicialMinimaRequerida) {
      throw new BadRequestException(
        `La inicial mínima permitida para esta unidad es S/ ${inicialMinimaRequerida.toFixed(2)} (${porcentajeInicialMinimo}%). Ingresó S/ ${montoInicialEfectivo.toFixed(2)}.`
      );
    }

    if (montoInicialEfectivo >= precioFinal) {
      throw new BadRequestException('La inicial no puede ser igual o mayor al precio total (compra al contado).');
    }

    const saldoAFinanciar = Math.round((precioFinal - montoInicialEfectivo) * 100) / 100;

    // Cuota semanal con factor dinámico dependiente del saldo real + costo fijo semanal
    const cuotaCalculada = (saldoAFinanciar * configPlazo.factor) + configPlazo.costoFijo;
    const cuotaSemanal = Math.round(cuotaCalculada * 100) / 100;
    const cuotaMensualEstimada = Math.round((cuotaSemanal * 4.3333) * 100) / 100;
    const totalFinanciado = Math.round((cuotaSemanal * configPlazo.semanas) * 100) / 100;
    const interesTotalEstimado = Math.round((totalFinanciado - saldoAFinanciar) * 100) / 100;

    return {
      precioLista: precioBase,
      descuento,
      precioFinal,
      montoInicial: montoInicialEfectivo,
      porcentajeInicial: porcentajeInicialEfectivo,
      saldoAFinanciar,
      plazoMeses,
      totalSemanas: configPlazo.semanas,
      periodicidad: 'SEMANAL',
      factorVariable: configPlazo.factor,
      costoFijoSemanal: configPlazo.costoFijo,
      cuotaSemanal,
      cuotaMensualEstimada,
      totalFinanciado,
      interesTotalEstimado,
    };
  }
}
