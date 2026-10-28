import { execSync } from 'node:child_process';
import './setup-env';

/**
 * Aplica las migraciones pendientes a la base de pruebas. Cada suite vacía sus tablas
 * con `resetDb()`, así que no hace falta recrear el esquema.
 */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: process.env });
}
