import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MePaymentsController } from './me-payments.controller';
import { PaymentCalculator } from './payment-calculator.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StudentStatusService } from './student-status.service';

@Module({
  imports: [BillingModule],
  controllers: [PaymentsController, MePaymentsController],
  providers: [PaymentsService, PaymentCalculator, StudentStatusService],
})
export class PaymentsModule {}
