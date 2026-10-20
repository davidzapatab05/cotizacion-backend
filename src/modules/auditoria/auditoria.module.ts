import { Global, Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaController } from './auditoria.controller';

@Global()
@Module({
  providers: [AuditoriaService],
  controllers: [AuditoriaController],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
