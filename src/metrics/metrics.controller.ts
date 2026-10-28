import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  MonthlyPointDto,
  MonthlyQuery,
  RecentPaymentDto,
  RecentQuery,
  SummaryDto,
  SummaryQuery,
} from './metrics.dto';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumen del periodo para el dashboard' })
  @ApiOkResponse({ type: SummaryDto })
  summary(@Query() query: SummaryQuery): Promise<SummaryDto> {
    return this.metrics.summary(query.periodo);
  }

  @Get('monthly')
  @ApiOperation({ summary: 'Serie mensual de recaudado en USD (meses sin pagos en 0)' })
  @ApiOkResponse({ type: [MonthlyPointDto] })
  monthly(@Query() query: MonthlyQuery): Promise<MonthlyPointDto[]> {
    return this.metrics.monthly(query.months);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Últimos pagos aprobados' })
  @ApiOkResponse({ type: [RecentPaymentDto] })
  recent(@Query() query: RecentQuery): Promise<RecentPaymentDto[]> {
    return this.metrics.recent(query.limit);
  }
}
