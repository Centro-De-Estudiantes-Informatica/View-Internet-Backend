import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [BillingModule],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
