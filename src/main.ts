import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as express from 'express';

// Filtrar advertencia de deprecación DEP0190 de child_process en Node 22/24
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && (warning as any).code === 'DEP0190') {
    return;
  }
  console.warn(warning.name, warning.message);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Protección de cabeceras HTTP contra ataques comunes (OWASP: XSS, Clickjacking, Sniffing, etc.)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      contentSecurityPolicy: false, // Permitir que la SPA cargue recursos e imágenes del catálogo
      xssFilter: true,
      noSniff: true,
      hidePoweredBy: true,
      frameguard: { action: 'deny' },
    }),
  );

  // Límite de tamaño de payload contra ataques de denegación de servicio (DoS / Payload Bombs)
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // CORS seguro
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 Servidor NestJS API corriendo en: http://localhost:${port}/api/v1`);
}
bootstrap();
