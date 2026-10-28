import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { toDateString } from '../common/domain/period';
import { Decimal, rate } from '../common/domain/money';
import { BillingService } from './billing.service';
import {
  BillingCurrentDto,
  FeeDto,
  ListRatesQuery,
  RateDto,
  SetFeeDto,
  SetRateDto,
} from './dto/billing.dto';
import { PeriodsService } from './periods.service';
import { RatesService } from './rates.service';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly rates: RatesService,
    private readonly periods: PeriodsService,
  ) {}

  @Get('current')
  @ApiOperation({ summary: 'Cuota del periodo actual en USD, VES y COP con la tasa usada' })
  @ApiOkResponse({ type: BillingCurrentDto })
  current(): Promise<BillingCurrentDto> {
    return this.billing.current();
  }

  @Roles(Role.ADMIN)
  @Put('fee')
  @ApiOperation({
    summary: 'Cambiar la cuota mensual (aplica a los periodos que se abran después)',
  })
  @ApiOkResponse({ type: FeeDto })
  setFee(@Body() dto: SetFeeDto, @CurrentUser() user: AuthUser): Promise<FeeDto> {
    return this.billing.setFee(new Decimal(dto.feeUsd), user.id);
  }

  @Roles(Role.ADMIN)
  @Post('rates')
  @ApiOperation({ summary: 'Registrar (o corregir) la tasa de un día' })
  @ApiOkResponse({ type: RateDto })
  async setRate(@Body() dto: SetRateDto, @CurrentUser() user: AuthUser): Promise<RateDto> {
    const date = dto.effectiveDate ?? this.periods.today();
    this.billing.assertNotFuture(date);
    return toRateDto(
      await this.rates.set(dto.currency, new Decimal(dto.ratePerUsd), date, user.id),
    );
  }

  @Roles(Role.ADMIN)
  @Get('rates')
  @ApiOperation({ summary: 'Historial de tasas, de la más reciente a la más antigua' })
  @ApiOkResponse({ type: [RateDto] })
  async listRates(@Query() query: ListRatesQuery): Promise<RateDto[]> {
    return (await this.rates.list(query.currency, query.limit)).map(toRateDto);
  }
}

function toRateDto(r: Awaited<ReturnType<RatesService['set']>>): RateDto {
  return {
    id: r.id,
    currency: r.currency,
    ratePerUsd: rate(r.ratePerUsd),
    effectiveDate: toDateString(r.effectiveDate),
    createdAt: r.createdAt,
  };
}
