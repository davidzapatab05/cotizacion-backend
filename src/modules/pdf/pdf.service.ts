import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
const PdfPrinter = require('pdfmake');
const QRCode = require('qrcode');
import { TDocumentDefinitions } from 'pdfmake/interfaces';

@Injectable()
export class PdfService {
  private fonts = {
    Roboto: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  };

  constructor(private prisma: PrismaService) {}

  async generarPdfCotizacion(cotizacionId: string): Promise<Buffer> {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id: cotizacionId },
      include: {
        sede: true,
        vendedor: true,
        cliente: true,
        moto: true,
      },
    });

    if (!cotizacion) {
      throw new NotFoundException('Cotización no encontrada');
    }

    // Cargar Logo si existe
    let logoDataUrl: string | null = null;
    try {
      const logoPath = path.join(__dirname, '../../assets/logo.png');
      if (fs.existsSync(logoPath)) {
        const logoBuf = fs.readFileSync(logoPath);
        logoDataUrl = `data:image/png;base64,${logoBuf.toString('base64')}`;
      }
    } catch (e) {
      console.warn('No se pudo cargar el logo para el PDF:', e);
    }

    // Generar QR Code de Proforma
    const qrPayload = JSON.stringify({
      empresa: 'KOTIZA DEALER',
      proforma: cotizacion.correlativoSede || 'COT-0001',
      cliente: `${cotizacion.cliente?.nombres} ${cotizacion.cliente?.apellidos}`,
      documento: cotizacion.cliente?.numeroDoc,
      moto: `${cotizacion.moto?.marca} ${cotizacion.moto?.modelo}`,
      cuota: `S/ ${Number(cotizacion.cuotaEstimada).toFixed(2)}/sem`,
      fecha: new Date(cotizacion.createdAt).toISOString().split('T')[0],
      sede: cotizacion.sede?.nombre || 'PIURA',
    });
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 100 });
    } catch (e) {
      console.warn('Error generando QR proforma:', e);
    }

    // Parsear adicionales si existen
    let adicionales: any[] = [];
    if (cotizacion.adicionalesJson) {
      try {
        adicionales = JSON.parse(cotizacion.adicionalesJson);
      } catch (e) {
        adicionales = [];
      }
    }

    // Calcular Cronograma de Pagos Cuota a Cuota
    const totalCuotas = cotizacion.plazoMeses * 4;
    const saldoTotalFinanciar = Number(cotizacion.saldoAFinanciar);
    const cuotaMonto = Number(cotizacion.cuotaEstimada);
    const cronogramaRows: any[] = [];

    // Tasa y seguro semanal aproximados
    const seguroGpsSemanal = 25.0; // S/ 25 fijos
    const interesFactorTotal = (cuotaMonto * totalCuotas) - saldoTotalFinanciar - (seguroGpsSemanal * totalCuotas);
    const interesSemanalAprox = Math.max(0, interesFactorTotal / totalCuotas);
    const amortizacionCapitalSemanal = saldoTotalFinanciar / totalCuotas;

    let saldoRestante = saldoTotalFinanciar;
    const fechaInicio = new Date(cotizacion.createdAt);

    for (let c = 1; c <= totalCuotas; c++) {
      const fechaVenc = new Date(fechaInicio);
      fechaVenc.setDate(fechaInicio.getDate() + (c * 7));
      saldoRestante = Math.max(0, saldoRestante - amortizacionCapitalSemanal);

      cronogramaRows.push([
        { text: `Sem. ${c}`, alignment: 'center', fontSize: 8 },
        { text: fechaVenc.toLocaleDateString('es-PE'), alignment: 'center', fontSize: 8 },
        { text: `S/ ${amortizacionCapitalSemanal.toFixed(2)}`, alignment: 'right', fontSize: 8 },
        { text: `S/ ${interesSemanalAprox.toFixed(2)}`, alignment: 'right', fontSize: 8 },
        { text: `S/ ${seguroGpsSemanal.toFixed(2)}`, alignment: 'right', fontSize: 8 },
        { text: `S/ ${cuotaMonto.toFixed(2)}`, alignment: 'right', bold: true, fontSize: 8, fillColor: '#eff6ff' },
        { text: `S/ ${saldoRestante.toFixed(2)}`, alignment: 'right', fontSize: 8, color: '#64748b' },
      ]);
    }

    // Preparar contenido de Adicionales
    const contentAdicionales: any[] = [];
    if (adicionales.length > 0 || Number(cotizacion.totalAdicionales) > 0) {
      contentAdicionales.push(
        { text: 'ADICIONALES, ACCESORIOS Y TRÁMITES INCLUIDOS', fontSize: 10, bold: true, color: '#0f172a', margin: [0, 8, 0, 4] },
        {
          table: {
            widths: ['60%', '20%', '20%'],
            body: [
              [
                { text: 'Concepto / Trámite', bold: true, fillColor: '#f1f5f9' },
                { text: 'Modalidad', bold: true, fillColor: '#f1f5f9', alignment: 'center' },
                { text: 'Monto', bold: true, fillColor: '#f1f5f9', alignment: 'right' },
              ],
              ...adicionales.map((item) => [
                { text: item.nombre || item.concepto },
                { text: item.financiado ? 'FINANCIADO EN CUOTAS' : 'AL CONTADO', alignment: 'center', color: item.financiado ? '#2563eb' : '#16a34a', bold: true },
                { text: `S/ ${Number(item.monto).toFixed(2)}`, alignment: 'right', bold: true },
              ]),
            ],
          },
          margin: [0, 0, 0, 10],
        }
      );
    }

    // Sección de Firma
    const firmaContent: any[] = [];
    if (cotizacion.firmaClienteBase64) {
      firmaContent.push(
        { text: '', margin: [0, 10] },
        {
          columns: [
            {
              width: '55%',
              stack: [
                { text: 'FIRMA DIGITAL DE CONFORMIDAD DEL CLIENTE', fontSize: 9, bold: true, color: '#1e293b' },
                { text: `Cliente: ${cotizacion.cliente?.nombres} ${cotizacion.cliente?.apellidos} (${cotizacion.cliente?.tipoDocumento}: ${cotizacion.cliente?.numeroDoc})`, fontSize: 8, color: '#475569' },
                { text: `Fecha y Hora: ${new Date().toLocaleString('es-PE')}`, fontSize: 8, color: '#64748b' },
                { text: 'Sello de Seguridad: VALIDADO DIGITALMENTE EN PANTALLA TÁCTIL KOTIZA DEALER', fontSize: 7, bold: true, color: '#16a34a' },
                {
                  image: cotizacion.firmaClienteBase64,
                  width: 140,
                  height: 48,
                  margin: [0, 4, 0, 0],
                },
                { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 180, y2: 2, lineWidth: 1, lineColor: '#94a3b8' }] },
                { text: 'Firma / Aceptación del Cliente', fontSize: 8, color: '#64748b', alignment: 'center', width: 180 },
              ],
            },
            {
              width: '45%',
              stack: [
                { text: 'ASESOR COMERCIAL RESPONSABLE', fontSize: 9, bold: true, color: '#1e293b' },
                { text: `${cotizacion.vendedor ? `${cotizacion.vendedor.nombres} ${cotizacion.vendedor.apellidos}` : 'ASESOR SALON'}`, fontSize: 8, color: '#475569' },
                { text: `Código: ${cotizacion.vendedor?.codigoVendedor || 'VEN-001'} | Sede: ${cotizacion.sede?.nombre || 'PIURA'}`, fontSize: 8, color: '#64748b' },
                { text: '', margin: [0, 24] },
                { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 180, y2: 2, lineWidth: 1, lineColor: '#94a3b8' }] },
                { text: 'Firma y Sello de Asesor Comercial', fontSize: 8, color: '#64748b', alignment: 'center', width: 180 },
              ],
            },
          ],
        }
      );
    } else {
      firmaContent.push(
        { text: '', margin: [0, 15] },
        {
          columns: [
            {
              width: '50%',
              stack: [
                { canvas: [{ type: 'line', x1: 20, y1: 0, x2: 200, y2: 0, lineWidth: 1, lineColor: '#94a3b8' }] },
                { text: 'Firma del Cliente', fontSize: 8, color: '#64748b', alignment: 'center', margin: [0, 4, 0, 0] },
                { text: `${cotizacion.cliente?.nombres} ${cotizacion.cliente?.apellidos} (${cotizacion.cliente?.numeroDoc})`, fontSize: 8, alignment: 'center', bold: true },
              ],
            },
            {
              width: '50%',
              stack: [
                { canvas: [{ type: 'line', x1: 20, y1: 0, x2: 200, y2: 0, lineWidth: 1, lineColor: '#94a3b8' }] },
                { text: 'Firma del Asesor Comercial', fontSize: 8, color: '#64748b', alignment: 'center', margin: [0, 4, 0, 0] },
                { text: `${cotizacion.vendedor ? `${cotizacion.vendedor.nombres} ${cotizacion.vendedor.apellidos}` : 'KOTIZA DEALER'}`, fontSize: 8, alignment: 'center', bold: true },
              ],
            },
          ],
        }
      );
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [36, 30, 36, 30],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 9,
        color: '#1e293b',
      },
      content: [
        // Encabezado Principal con Logo y QR
        {
          columns: [
            logoDataUrl
              ? {
                  width: 55,
                  image: logoDataUrl,
                  fit: [55, 55],
                }
              : { width: 0, text: '' },
            {
              width: '*',
              margin: [logoDataUrl ? 10 : 0, 0, 0, 0],
              stack: [
                { text: 'KOTIZA DEALER', fontSize: 16, bold: true, color: '#1e40af', letterSpacing: 0.5 },
                { text: 'SISTEMA INTEGRAL DE FINANCIAMIENTO AUTOMOTRIZ', fontSize: 8, bold: true, color: '#475569' },
                { text: `${cotizacion.sede?.nombre || 'SEDE PIURA'} | ${cotizacion.sede?.direccion || 'Av. Sánchez Cerro 1234'}`, fontSize: 8, color: '#64748b' },
                { text: `RUC: ${cotizacion.sede?.ruc || '20600000001'} | Tel: ${cotizacion.sede?.telefono || '(073) 304050'}`, fontSize: 8, color: '#64748b' },
              ],
            },
            qrDataUrl
              ? {
                  width: 65,
                  stack: [
                    { image: qrDataUrl, fit: [60, 60], alignment: 'right' },
                    { text: 'Escanea en celular', fontSize: 6, color: '#64748b', alignment: 'right' },
                  ],
                }
              : { width: 0, text: '' },
            {
              width: 145,
              stack: [
                { text: 'PROFORMA COMERCIAL', fontSize: 10, bold: true, alignment: 'right', color: '#2563eb' },
                { text: cotizacion.correlativoSede || 'COT-00001', fontSize: 13, bold: true, alignment: 'right', color: '#0f172a' },
                { text: `Emisión: ${new Date(cotizacion.createdAt).toLocaleDateString('es-PE')}`, fontSize: 8, alignment: 'right' },
                { text: `Válido hasta: ${new Date(cotizacion.fechaVigencia).toLocaleDateString('es-PE')}`, fontSize: 8, bold: true, alignment: 'right', color: '#dc2626' },
              ],
            },
          ],
        },
        { text: '', margin: [0, 4] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 2, lineColor: '#2563eb' }] },
        { text: '', margin: [0, 6] },

        // Datos del Vendedor y Cliente
        {
          columns: [
            {
              width: '50%',
              stack: [
                { text: 'DATOS DEL CLIENTE', fontSize: 9, bold: true, color: '#1e3a8a' },
                { text: `Nombre: ${cotizacion.cliente?.nombres || ''} ${cotizacion.cliente?.apellidos || ''}`, fontSize: 8, bold: true },
                { text: `${cotizacion.cliente?.tipoDocumento || 'DNI'}: ${cotizacion.cliente?.numeroDoc || ''}`, fontSize: 8 },
                { text: `Teléfono: ${cotizacion.cliente?.telefono || '—'}`, fontSize: 8 },
                { text: `Dirección: ${cotizacion.cliente?.direccion || 'Piura'}`, fontSize: 8 },
              ],
            },
            {
              width: '50%',
              stack: [
                { text: 'ASESOR EN SALÓN DE VENTAS', fontSize: 9, bold: true, color: '#1e3a8a' },
                { text: `Asesor: ${cotizacion.vendedor ? `${cotizacion.vendedor.nombres} ${cotizacion.vendedor.apellidos}` : 'ASESOR EN SALON'}`, fontSize: 8, bold: true },
                { text: `Código Asesor: ${cotizacion.vendedor?.codigoVendedor || 'VEN-PIU-001'}`, fontSize: 8, color: '#2563eb', bold: true },
                { text: `Sede: ${cotizacion.sede?.nombre || 'Sede Central Piura'}`, fontSize: 8 },
                { text: `Contacto: ${cotizacion.vendedor?.telefono || cotizacion.vendedor?.email || 'ventas@kotizadealer.pe'}`, fontSize: 8 },
              ],
            },
          ],
        },

        { text: '', margin: [0, 6] },

        // Datos del Vehículo
        { text: 'DETALLE DEL VEHÍCULO Y ESPECIFICACIONES TÉCNICAS', fontSize: 9, bold: true, color: '#0f172a' },
        {
          table: {
            widths: ['35%', '25%', '20%', '20%'],
            body: [
              [
                { text: 'Modelo / Versión', bold: true, fillColor: '#f1f5f9', fontSize: 8 },
                { text: 'Motor / Cilindrada', bold: true, fillColor: '#f1f5f9', fontSize: 8 },
                { text: 'Potencia / Frenos', bold: true, fillColor: '#f1f5f9', fontSize: 8 },
                { text: 'Color Elegido', bold: true, fillColor: '#f1f5f9', fontSize: 8 },
              ],
              [
                { text: `${cotizacion.moto.marca} ${cotizacion.moto.modelo} (${cotizacion.moto.anio})\n${cotizacion.moto.version || ''}`, fontSize: 8 },
                { text: `${cotizacion.moto.cilindradaCc} cc\n${cotizacion.moto.tipoMotor || '4 Tiempos SOHC'}`, fontSize: 8 },
                { text: `${cotizacion.moto.potenciaHp ? cotizacion.moto.potenciaHp + ' HP' : 'Standard'}\n${cotizacion.moto.sistemaFrenos || 'Disco Del / Tambor Tras'}`, fontSize: 8 },
                { text: cotizacion.colorSeleccionado || 'A elección del cliente', fontSize: 8, bold: true },
              ],
            ],
          },
          margin: [0, 3, 0, 8],
        },

        // Resumen Económico
        { text: 'RESUMEN ECONÓMICO Y PLAN FINANCIERO', fontSize: 9, bold: true, color: '#0f172a' },
        {
          table: {
            widths: ['65%', '35%'],
            body: [
              [{ text: 'Precio de Lista Oficial:', bold: true, fontSize: 8 }, { text: `S/ ${Number(cotizacion.precioListaMoto).toFixed(2)}`, alignment: 'right', fontSize: 8 }],
              [{ text: 'Descuento Comercial Autorizado en Salón:', bold: true, fontSize: 8 }, { text: `- S/ ${Number(cotizacion.descuentoMonto).toFixed(2)}`, alignment: 'right', color: '#dc2626', fontSize: 8 }],
              [{ text: 'Precio Final de Venta Vehículo:', bold: true, fillColor: '#f8fafc', fontSize: 8 }, { text: `S/ ${Number(cotizacion.precioFinalVenta).toFixed(2)}`, bold: true, alignment: 'right', fillColor: '#f8fafc', fontSize: 8 }],
              ...(Number(cotizacion.totalAdicionales) > 0 ? [[{ text: 'Accesorios, Trámites y Servicios Agregados:', bold: true, fontSize: 8 }, { text: `+ S/ ${Number(cotizacion.totalAdicionales).toFixed(2)}`, alignment: 'right', color: '#2563eb', fontSize: 8 }]] : []),
              [{ text: `Cuota Inicial Aportada (${Number(cotizacion.porcentajeInicial).toFixed(1)}%):`, bold: true, fillColor: '#eff6ff', fontSize: 8 }, { text: `S/ ${Number(cotizacion.montoInicial).toFixed(2)}`, bold: true, alignment: 'right', color: '#1d4ed8', fillColor: '#eff6ff', fontSize: 8 }],
              [{ text: 'Saldo Neto Total a Financiar:', bold: true, fontSize: 8 }, { text: `S/ ${Number(cotizacion.saldoAFinanciar).toFixed(2)}`, alignment: 'right', fontSize: 8 }],
              [{ text: 'Plazo y Modalidad del Financiamiento:', bold: true, fontSize: 8 }, { text: `${cotizacion.plazoMeses} Meses (${cotizacion.plazoMeses * 4} Semanas)`, alignment: 'right', fontSize: 8, bold: true }],
              [{ text: 'CUOTA SEMANAL ESTIMADA (TODO INCLUIDO):', bold: true, fontSize: 10, fillColor: '#dbeafe' }, { text: `S/ ${Number(cotizacion.cuotaEstimada).toFixed(2)}`, bold: true, fontSize: 11, alignment: 'right', color: '#1e40af', fillColor: '#dbeafe' }],
            ],
          },
          margin: [0, 3, 0, 8],
        },

        ...contentAdicionales,

        // Términos y Firmas
        {
          stack: [
            { text: 'TÉRMINOS Y CONDICIONES GENERALES:', fontSize: 7, bold: true, color: '#475569' },
            { text: '1. Las cuotas semanales incluyen seguro vehicular de desgravamen y monitoreo GPS obligatorio según políticas vigentes.', fontSize: 7, color: '#64748b' },
            { text: '2. Sujeto a validación final de capacidad crediticia por la financiera aliada.', fontSize: 7, color: '#64748b' },
            { text: '3. El cliente puede realizar amortizaciones extraordinarias a capital sin cobro de penalidades ni comisiones.', fontSize: 7, color: '#64748b' },
            { text: '4. Vigencia de 15 días calendario a partir de su emisión en sala de ventas.', fontSize: 7, color: '#64748b' },
          ],
        },

        ...firmaContent,

        // PÁGINA 2: Cronograma Detallado Cuota a Cuota
        { text: '', pageBreak: 'before' },
        {
          columns: [
            logoDataUrl ? { width: 45, image: logoDataUrl, fit: [45, 45] } : { width: 0, text: '' },
            {
              width: '*',
              margin: [8, 0, 0, 0],
              stack: [
                { text: 'KOTIZA DEALER — ANEXO 1: CALENDARIO DE AMORTIZACIÓN DETALLADO', fontSize: 11, bold: true, color: '#1e40af' },
                { text: `Proforma: ${cotizacion.correlativoSede || 'COT-0001'} | Cliente: ${cotizacion.cliente?.nombres} ${cotizacion.cliente?.apellidos} (${cotizacion.cliente?.numeroDoc})`, fontSize: 8, color: '#475569' },
                { text: `Vehículo: ${cotizacion.moto.marca} ${cotizacion.moto.modelo} | Saldo Financiado: S/ ${Number(cotizacion.saldoAFinanciar).toFixed(2)} | Plazo: ${totalCuotas} Cuotas Semanales`, fontSize: 8, color: '#64748b' },
              ],
            },
          ],
        },
        { text: '', margin: [0, 4] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 523, y2: 0, lineWidth: 1.5, lineColor: '#2563eb' }] },
        { text: '', margin: [0, 6] },
        {
          table: {
            headerRows: 1,
            widths: ['12%', '14%', '15%', '15%', '15%', '14%', '15%'],
            body: [
              [
                { text: 'N° Cuota', bold: true, fillColor: '#1e40af', color: '#ffffff', alignment: 'center', fontSize: 8 },
                { text: 'Vencimiento', bold: true, fillColor: '#1e40af', color: '#ffffff', alignment: 'center', fontSize: 8 },
                { text: 'Amort. Capital', bold: true, fillColor: '#1e40af', color: '#ffffff', alignment: 'right', fontSize: 8 },
                { text: 'Factor / Interés', bold: true, fillColor: '#1e40af', color: '#ffffff', alignment: 'right', fontSize: 8 },
                { text: 'Seguro / GPS', bold: true, fillColor: '#1e40af', color: '#ffffff', alignment: 'right', fontSize: 8 },
                { text: 'Cuota Total', bold: true, fillColor: '#1e40af', color: '#ffffff', alignment: 'right', fontSize: 8 },
                { text: 'Saldo Restante', bold: true, fillColor: '#1e40af', color: '#ffffff', alignment: 'right', fontSize: 8 },
              ],
              ...cronogramaRows,
            ],
          },
        },
      ],
    };

    return new Promise((resolve, reject) => {
      const printer = new PdfPrinter(this.fonts);
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];

      pdfDoc.on('data', (chunk) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', (err) => reject(err));
      pdfDoc.end();
    });
  }
}
