import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { MetricsModule } from './metrics/metrics.module';
import { PaymentsModule } from './payments/payments.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { AppConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    StorageModule,
    BillingModule,
    UsersModule,
    PaymentsModule,
    MetricsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
