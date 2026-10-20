import { Module } from '@nestjs/common';
import { MotosService } from './motos.service';
import { MotosController } from './motos.controller';

@Module({
  providers: [MotosService],
  controllers: [MotosController],
  exports: [MotosService],
})
export class MotosModule {}
