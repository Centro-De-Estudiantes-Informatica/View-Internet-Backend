import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { normalizeCedula } from '../src/common/domain/cedula';
import { searchableText } from '../src/common/domain/text';

/**
 * Crea el primer ADMIN a partir de SEED_ADMIN_CEDULA / SEED_ADMIN_PASSWORD (y SEED_ADMIN_NAME).
 * Es idempotente: si la cédula ya existe no modifica nada.
 */
async function main(): Promise<void> {
  const rawCedula = process.env.SEED_ADMIN_CEDULA;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const fullName = process.env.SEED_ADMIN_NAME ?? 'Administrador';
  if (!rawCedula || !password) {
    throw new Error('Faltan SEED_ADMIN_CEDULA y/o SEED_ADMIN_PASSWORD');
  }
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres');
  }
  const cedula = normalizeCedula(rawCedula);
  if (!cedula) throw new Error(`SEED_ADMIN_CEDULA inválida: ${rawCedula}`);

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({
      where: {
        cedulaPrefix_cedulaDigits: { cedulaPrefix: cedula.prefix, cedulaDigits: cedula.digits },
      },
    });
    if (existing) {
      console.log(`El usuario ${cedula.prefix}${cedula.digits} ya existe; no se modifica.`);
      return;
    }
    const cost = Number(process.env.BCRYPT_COST ?? 12);
    await prisma.user.create({
      data: {
        cedulaPrefix: cedula.prefix,
        cedulaDigits: cedula.digits,
        fullName,
        fullNameSearch: searchableText(fullName),
        role: 'ADMIN',
        passwordHash: await hash(password, cost),
        mustChangePassword: true,
      },
    });
    console.log(
      `Administrador ${cedula.prefix}${cedula.digits} creado (debe cambiar la contraseña).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
