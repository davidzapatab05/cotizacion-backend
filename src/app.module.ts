import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { SedesModule } from './modules/sedes/sedes.module';
import { MotosModule } from './modules/motos/motos.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { CotizadorModule } from './modules/cotizador/cotizador.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { RolesMgmtModule } from './modules/roles/roles-mgmt.module';
import { MarcasModule } from './modules/marcas/marcas.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditoriaModule,
    AuthModule,
    UsuariosModule,
    RolesMgmtModule,
    SedesModule,
    MarcasModule,
    MotosModule,
    ClientesModule,
    CotizadorModule,
    PdfModule,
    DashboardModule,
  ],
})
export class AppModule {}
