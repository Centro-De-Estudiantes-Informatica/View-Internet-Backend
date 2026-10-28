import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApproveDto,
  CashPaymentDto,
  ListPaymentsQuery,
  PaymentDto,
  PaymentPageDto,
  ReasonDto,
  ReceiptUrlDto,
} from './dto/payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Listado de pagos (la cola de revisión es status=EN_REVISION)' })
  @ApiOkResponse({ type: PaymentPageDto })
  list(@Query() query: ListPaymentsQuery): Promise<PaymentPageDto> {
    return this.payments.list(query);
  }

  @Post('cash')
  @ApiOperation({ summary: 'Registrar pago en efectivo (queda APROBADO)' })
  @ApiCreatedResponse({ type: PaymentDto })
  registerCash(@Body() dto: CashPaymentDto, @CurrentUser() actor: AuthUser): Promise<PaymentDto> {
    return this.payments.registerCash(dto, actor.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar un pago EN_REVISION' })
  @ApiOkResponse({ type: PaymentDto })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentDto> {
    return this.payments.approve(id, actor.id, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar un pago EN_REVISION con motivo (lo ve el estudiante)' })
  @ApiOkResponse({ type: PaymentDto })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentDto> {
    return this.payments.reject(id, actor.id, dto.reason);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular un pago APROBADO con motivo (los pagos nunca se borran)' })
  @ApiOkResponse({ type: PaymentDto })
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentDto> {
    return this.payments.void(id, actor.id, dto.reason);
  }

  @Get(':id/receipt')
  @ApiOperation({ summary: 'URL firmada (5 min) de la captura del pago móvil' })
  @ApiOkResponse({ type: ReceiptUrlDto })
  receipt(@Param('id', ParseUUIDPipe) id: string): Promise<ReceiptUrlDto> {
    return this.payments.receiptUrl(id);
  }
}
