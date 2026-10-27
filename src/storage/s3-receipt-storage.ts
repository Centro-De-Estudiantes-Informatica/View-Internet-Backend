import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpStatus, Injectable } from '@nestjs/common';
import { BusinessError } from '../common/errors/business-error';
import { AppConfig } from '../config/app-config.service';
import { ReceiptStorage } from './receipt-storage';

/** Bucket privado S3 compatible (Cloudflare R2, Neon Object Storage, MinIO, AWS S3). */
@Injectable()
export class S3ReceiptStorage extends ReceiptStorage {
  private readonly client?: S3Client;
  private readonly bucket?: string;

  constructor(config: AppConfig) {
    super();
    const bucket = config.get('S3_BUCKET');
    const accessKeyId = config.get('S3_ACCESS_KEY_ID');
    const secretAccessKey = config.get('S3_SECRET_ACCESS_KEY');
    if (bucket && accessKeyId && secretAccessKey) {
      this.bucket = bucket;
      this.client = new S3Client({
        endpoint: config.get('S3_ENDPOINT'),
        region: config.get('S3_REGION'),
        forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { client, bucket } = this.configured();
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const { client, bucket } = this.configured();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async delete(key: string): Promise<void> {
    const { client, bucket } = this.configured();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  private configured(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) {
      throw new BusinessError(
        'STORAGE_NOT_CONFIGURED',
        'El almacenamiento de capturas no está configurado',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { client: this.client, bucket: this.bucket };
  }
}
