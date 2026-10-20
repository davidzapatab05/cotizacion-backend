# Kotiza Dealer - Backend API

API RESTful empresarial desarrollada con NestJS, Prisma ORM y PostgreSQL para la gestión integral de cotizaciones automotrices, catálogo multisede, Kardex de inventario en tiempo real, control de acceso basado en roles (RBAC) y auditoría criptográfica.

## Tecnologías

- **Framework**: NestJS 10
- **ORM & DB**: Prisma ORM con PostgreSQL
- **Autenticación**: Passport JWT con bcryptjs
- **Arquitectura**: Arquitectura Modular, DTOs, Guards RBAC, Transacciones ACID

## Instalación y Configuración

```bash
# 1. Instalar dependencias
pnpm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL

# 3. Aplicar migraciones y generar cliente Prisma
npx prisma generate
npx prisma db push

# 4. Iniciar servidor en desarrollo
pnpm run start:dev
```

La API estará disponible en `http://localhost:4000/api/v1`.
