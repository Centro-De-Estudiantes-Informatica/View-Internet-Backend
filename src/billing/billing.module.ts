import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PeriodsService } from './periods.service';
import { RatesService } from './rates.service';
import { SettingsService } from './settings.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PeriodsService, RatesService, SettingsService],
  exports: [BillingService, PeriodsService, RatesService, SettingsService],
})
export class BillingModule {}
