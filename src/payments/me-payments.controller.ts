import { Body, Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MAX_RECEIPT_BYTES } from '../storage/image-type';
import {
  MobilePaymentDto,
  MobilePaymentFormDto,
  MyStatusDto,
  PaymentDto,
} from './dto/payments.dto';
import { PaymentsService } from './payments.service';
import { StudentStatusService } from './student-status.service';

/** Rutas de la propia persona: nunca reciben un id ajeno. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MePaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly status: StudentStatusService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Mi estado del periodo actual, periodos adeudados y monto pendiente' })
  @ApiOkResponse({ type: MyStatusDto })
  myStatus(@CurrentUser() user: AuthUser): Promise<MyStatusDto> {
    return this.status.forUser(user.id);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Mi historial de pagos, incluidos los rechazados con su motivo' })
  @ApiOkResponse({ type: [PaymentDto] })
  myPayments(@CurrentUser() user: AuthUser): Promise<PaymentDto[]> {
    return this.payments.listForUser(user.id);
  }

  @Roles(Role.ESTUDIANTE)
  @Post('payments/mobile')
  @UseInterceptors(
    FileInterceptor('receipt', { limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: MobilePaymentFormDto })
  @ApiOperation({ summary: 'Reportar un pago móvil en VES (queda EN_REVISION)' })
  @ApiCreatedResponse({ type: PaymentDto })
  reportMobile(
    @CurrentUser() user: AuthUser,
    @Body() dto: MobilePaymentDto,
    @UploadedFile() receipt?: Express.Multer.File,
  ): Promise<PaymentDto> {
    return this.payments.reportMobile(user.id, dto, receipt);
  }
}
