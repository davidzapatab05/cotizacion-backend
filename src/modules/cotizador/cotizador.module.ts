import { Module } from '@nestjs/common';
import { CotizadorService } from './cotizador.service';
import { CotizadorController } from './cotizador.controller';
import { FinancialEngineService } from './financial-engine.service';

@Module({
  providers: [CotizadorService, FinancialEngineService],
  controllers: [CotizadorController],
  exports: [CotizadorService, FinancialEngineService],
})
export class CotizadorModule {}
