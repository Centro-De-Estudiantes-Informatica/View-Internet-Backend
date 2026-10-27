import { Global, Module } from '@nestjs/common';
import { ReceiptStorage } from './receipt-storage';
import { S3ReceiptStorage } from './s3-receipt-storage';

@Global()
@Module({
  providers: [{ provide: ReceiptStorage, useClass: S3ReceiptStorage }],
  exports: [ReceiptStorage],
})
export class StorageModule {}
