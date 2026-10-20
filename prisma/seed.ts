import { PrismaClient, Role, TipoDocumento } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando Seeder para Sede Piura, RBAC granular y Super Admin...');

  // 1. Crear Sede Piura
  const sedePiura = await prisma.sede.upsert({
    where: { codigo: 'PIU-01' },
    update: {},
    create: {
      codigo: 'PIU-01',
      nombre: 'Sede Central Piura — Concesionaria Global Go',
      direccion: 'Av. Sánchez Cerro 1240, Piura',
      ciudad: 'Piura',
      departamento: 'Piura',
      telefono: '(073) 304050',
      ruc: '20601234567',
      activo: true,
    },
  });
  console.log(`✅ Sede creada: ${sedePiura.nombre} (${sedePiura.codigo})`);

  // 2. Crear Catálogo de Permisos Granulares por Módulo y Acción CRUD
  const modulos = ['catalogo', 'cotizaciones', 'usuarios', 'roles', 'auditoria', 'reportes'];
  const acciones = ['ver', 'crear', 'editar', 'eliminar'];

  const permisosCreados: Record<string, string> = {};

  for (const modulo of modulos) {
    for (const accion of acciones) {
      const codigo = `${modulo}:${accion}`;
      const permiso = await prisma.permiso.upsert({
        where: { modulo_accion: { modulo, accion } },
        update: {},
        create: {
          codigo,
          modulo,
          accion,
          descripcion: `Permiso para ${accion} en módulo ${modulo}`,
        },
      });
      permisosCreados[codigo] = permiso.id;
    }
  }
  console.log('✅ 24 Permisos granulares CRUD inicializados en la base de datos.');

  // 3. Crear Definición de Roles del Sistema
  const rolesDefs = [
    {
      nombre: 'SUPER_ADMIN',
      descripcion: 'Acceso total y configuración global del sistema',
      permisos: Object.keys(permisosCreados), // Todos los permisos
    },
    {
      nombre: 'ADMIN_SEDE',
      descripcion: 'Gestión completa de sucursal, stock y vendedores locales',
      permisos: [
        'catalogo:ver', 'catalogo:crear', 'catalogo:editar',
        'cotizaciones:ver', 'cotizaciones:crear', 'cotizaciones:editar', 'cotizaciones:eliminar',
        'usuarios:ver', 'usuarios:crear', 'usuarios:editar',
        'auditoria:ver',
        'reportes:ver', 'reportes:crear',
      ],
    },
    {
      nombre: 'VENDEDOR',
      descripcion: 'Asesor comercial para catálogo, cotizador y clientes propios',
      permisos: [
        'catalogo:ver',
        'cotizaciones:ver', 'cotizaciones:crear',
      ],
    },
  ];

  for (const r of rolesDefs) {
    const rol = await prisma.rolDefinicion.upsert({
      where: { nombre: r.nombre },
      update: { descripcion: r.descripcion },
      create: {
        nombre: r.nombre,
        descripcion: r.descripcion,
        esSistema: true,
      },
    });

    // Asignar permisos al rol
    for (const permCode of r.permisos) {
      const permisoId = permisosCreados[permCode];
      if (permisoId) {
        await prisma.rolPermiso.upsert({
          where: {
            rolId_permisoId: {
              rolId: rol.id,
              permisoId,
            },
          },
          update: {},
          create: {
            rolId: rol.id,
            permisoId,
          },
        });
      }
    }
  }
  console.log('✅ Roles del sistema (SUPER_ADMIN, ADMIN_SEDE, VENDEDOR) vinculados con su matriz de permisos.');

  // 4. Crear Usuarios

  // SUPER ADMIN SOLICITADO: davidzapata.dz051099@gmail.com / 73631587
  const davidPassword = await bcrypt.hash('73631587', 10);
  const davidSuperAdmin = await prisma.usuario.upsert({
    where: { email: 'davidzapata.dz051099@gmail.com' },
    update: {
      passwordHash: davidPassword,
      rol: Role.SUPER_ADMIN,
      activo: true,
    },
    create: {
      email: 'davidzapata.dz051099@gmail.com',
      passwordHash: davidPassword,
      nombres: 'DAVID',
      apellidos: 'ZAPATA',
      telefono: '969123456',
      rol: Role.SUPER_ADMIN,
      sedeId: sedePiura.id,
      descuentoMaximo: 20.00,
      activo: true,
    },
  });
  console.log(`⭐ Super Admin creado con éxito: ${davidSuperAdmin.email} (Rol: ${davidSuperAdmin.rol})`);

  // Otros usuarios de prueba
  const defaultPassword = await bcrypt.hash('admin123', 10);

  // Administrador de Sede Piura
  await prisma.usuario.upsert({
    where: { email: 'gerente.piura@concesionaria.pe' },
    update: {
      nombres: 'GERENTE TIENDA',
      apellidos: 'PIURA',
    },
    create: {
      email: 'gerente.piura@concesionaria.pe',
      passwordHash: defaultPassword,
      nombres: 'GERENTE TIENDA',
      apellidos: 'PIURA',
      telefono: '987654321',
      rol: Role.ADMIN_SEDE,
      sedeId: sedePiura.id,
      descuentoMaximo: 10.00,
      activo: true,
    },
  });

  // Vendedor Piura
  const vendedor = await prisma.usuario.upsert({
    where: { email: 'carlos.piura@concesionaria.pe' },
    update: {
      nombres: 'CARLOS',
      apellidos: 'ZAPATA MENDOZA',
    },
    create: {
      email: 'carlos.piura@concesionaria.pe',
      passwordHash: defaultPassword,
      nombres: 'CARLOS',
      apellidos: 'ZAPATA MENDOZA',
      telefono: '969123456',
      codigoVendedor: 'VEN-PIU-001',
      rol: Role.VENDEDOR,
      sedeId: sedePiura.id,
      descuentoMaximo: 5.00,
      activo: true,
    },
  });

  // Ejemplo de permiso extendido a Carlos (Vendedor con permiso extra para editar catalogo)
  const permisoEditarCatalogoId = permisosCreados['catalogo:editar'];
  if (permisoEditarCatalogoId) {
    await prisma.usuarioPermiso.upsert({
      where: {
        usuarioId_permisoId: {
          usuarioId: vendedor.id,
          permisoId: permisoEditarCatalogoId,
        },
      },
      update: { concedido: true },
      create: {
        usuarioId: vendedor.id,
        permisoId: permisoEditarCatalogoId,
        concedido: true,
      },
    });
    console.log(`✅ Permiso individual extendido asignado a Carlos: catalogo:editar`);
  }

  // 5. Motos en Catálogo
  await prisma.moto.upsert({
    where: { id: 'moto-honda-cb190r-2026' },
    update: {},
    create: {
      id: 'moto-honda-cb190r-2026',
      marca: 'Honda',
      modelo: 'CB190R Repsol Edition',
      version: 'Fi ABS 2026',
      anio: 2026,
      cilindradaCc: 184,
      tipoMotor: '4 Tiempos, OHC, Refrigerado por Aire',
      potenciaHp: 16.00,
      torqueNm: 15.30,
      sistemaFrenos: 'Disco Delantero con ABS / Disco Posterior',
      capacidadTanqueGal: 3.17,
      rendimientoKmGal: 140.00,
      precioBase: 4000.00,
      porcentajeInicialMinima: 30.00,
      imagenes: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=800&q=80',
            esPrincipal: true,
            orden: 0,
          },
        ],
      },
      inventarioSedes: {
        create: [
          { sedeId: sedePiura.id, color: 'Naranja Repsol Racing', stock: 3 },
          { sedeId: sedePiura.id, color: 'Negro Mate / Grafito', stock: 2 },
        ],
      },
    },
  });

  await prisma.moto.upsert({
    where: { id: 'moto-bajaj-pulsar-ns200-2026' },
    update: {},
    create: {
      id: 'moto-bajaj-pulsar-ns200-2026',
      marca: 'Bajaj',
      modelo: 'Pulsar NS200 Fi ABS',
      version: 'Dual Channel ABS 2026',
      anio: 2026,
      cilindradaCc: 199,
      tipoMotor: '4 Tiempos, 4 Válvulas, Triple Bujía DTS-i',
      potenciaHp: 24.13,
      torqueNm: 18.74,
      sistemaFrenos: 'Doble Disco con ABS Delantero y Trasero',
      capacidadTanqueGal: 3.17,
      rendimientoKmGal: 130.00,
      precioBase: 3800.00,
      porcentajeInicialMinima: 30.00,
      imagenes: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=800&q=80',
            esPrincipal: true,
            orden: 0,
          },
        ],
      },
      inventarioSedes: {
        create: [
          { sedeId: sedePiura.id, color: 'Azul Plasma / Blanco', stock: 4 },
          { sedeId: sedePiura.id, color: 'Negro Ébano Brillante', stock: 4 },
        ],
      },
    },
  });

  await prisma.moto.upsert({
    where: { id: 'moto-yamaha-fz25-2026' },
    update: {},
    create: {
      id: 'moto-yamaha-fz25-2026',
      marca: 'Yamaha',
      modelo: 'FZ-25 Connected',
      version: 'Blue Core Fi ABS 2026',
      anio: 2026,
      cilindradaCc: 249,
      tipoMotor: '4 Tiempos, SOHC, Blue Core refrigerado por aire',
      potenciaHp: 20.60,
      torqueNm: 20.00,
      sistemaFrenos: 'Frenos de Disco Delantero y Trasero con ABS',
      capacidadTanqueGal: 3.70,
      rendimientoKmGal: 125.00,
      precioBase: 3500.00,
      porcentajeInicialMinima: 30.00,
      imagenes: {
        create: [
          {
            url: 'https://images.unsplash.com/photo-1571188654248-7a89213915f7?auto=format&fit=crop&w=800&q=80',
            esPrincipal: true,
            orden: 0,
          },
        ],
      },
      inventarioSedes: {
        create: [
          { sedeId: sedePiura.id, color: 'Cyan Metalizado / Gris', stock: 3 },
          { sedeId: sedePiura.id, color: 'Negro Midnight', stock: 3 },
        ],
      },
    },
  });

  // 6. Cliente inicial
  await prisma.cliente.upsert({
    where: { numeroDoc: '71234567' },
    update: {
      nombres: 'JOSE MIGUEL',
      apellidos: 'GARCIA CASTILLO',
      direccion: 'URB. MIRAFLORES MZ. B LT. 14, PIURA',
      ciudad: 'PIURA',
    },
    create: {
      tipoDocumento: TipoDocumento.DNI,
      numeroDoc: '71234567',
      nombres: 'JOSE MIGUEL',
      apellidos: 'GARCIA CASTILLO',
      telefono: '968777123',
      email: 'jose.garcia@gmail.com',
      direccion: 'URB. MIRAFLORES MZ. B LT. 14, PIURA',
      ciudad: 'PIURA',
    },
  });

  console.log('✨ Seed completo con Roles, Permisos y Super Admin David Zapata!');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
