/**
 * Crea el bucket de capturas en el almacenamiento S3 local (usa las variables S3_* de `.env`).
 * Es idempotente: si el bucket ya existe, no hace nada.
 */
import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';

process.loadEnvFile('.env');

async function main(): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  if (!process.env.S3_ENDPOINT || !bucket) throw new Error('Faltan S3_ENDPOINT y/o S3_BUCKET');
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'auto',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`El bucket ${bucket} ya existe.`);
    return;
  } catch {
    // No existe todavía.
  }
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Bucket ${bucket} creado.`);
  } catch (err) {
    if (!(err instanceof BucketAlreadyOwnedByYou)) throw err;
  }
}

void main();
