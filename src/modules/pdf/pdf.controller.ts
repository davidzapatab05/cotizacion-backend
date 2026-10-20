import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response } from 'express';

@Controller('pdf')
export class PdfController {
  constructor(private pdfService: PdfService) {}

  @Get('cotizacion/:id')
  async descargarPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generarPdfCotizacion(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Cotizacion_${id}.pdf"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }
}
