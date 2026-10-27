import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RateCurrency } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { DATE_RE } from '../../common/domain/period';
import { IsPositiveDecimalString } from '../../common/validation/decimal-string';

export class SetFeeDto {
  @ApiProperty({ example: '5.00', description: 'Cuota mensual en USD' })
  @IsPositiveDecimalString(2, 8)
  feeUsd!: string;
}

export class SetRateDto {
  @ApiProperty({ enum: RateCurrency })
  @IsEnum(RateCurrency)
  currency!: RateCurrency;

  @ApiProperty({ example: '200.00', description: 'Unidades de la moneda por 1 USD' })
  @IsPositiveDecimalString(4, 14)
  ratePerUsd!: string;

  @ApiPropertyOptional({ example: '2026-10-26', description: 'Por defecto, hoy' })
  @IsOptional()
  @Matches(DATE_RE, { message: 'effectiveDate debe tener el formato AAAA-MM-DD' })
  effectiveDate?: string;
}

export class ListRatesQuery {
  @ApiPropertyOptional({ enum: RateCurrency })
  @IsOptional()
  @IsEnum(RateCurrency)
  currency?: RateCurrency;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  limit = 30;
}

export class RateDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: RateCurrency }) currency!: RateCurrency;
  @ApiProperty({ example: '200.0000' }) ratePerUsd!: string;
  @ApiProperty({ example: '2026-10-26' }) effectiveDate!: string;
  @ApiProperty() createdAt!: Date;
}

export class CurrentRateDto {
  @ApiProperty({ example: '200.0000' }) ratePerUsd!: string;
  @ApiProperty({ example: '2026-10-26' }) effectiveDate!: string;
  @ApiProperty({ description: 'true si la tasa tiene más de 1 día' }) stale!: boolean;
}

export class FeeByCurrencyDto {
  @ApiProperty({ example: '5.00' }) USD!: string;
  @ApiProperty({ example: '1000.00', nullable: true, type: String }) VES!: string | null;
  @ApiProperty({ example: '20000.00', nullable: true, type: String }) COP!: string | null;
}

export class RatesByCurrencyDto {
  @ApiProperty({ type: CurrentRateDto, nullable: true }) VES!: CurrentRateDto | null;
  @ApiProperty({ type: CurrentRateDto, nullable: true }) COP!: CurrentRateDto | null;
}

export class BillingCurrentDto {
  @ApiProperty({ example: '2026-10' }) periodo!: string;
  @ApiProperty({ example: '5.00' }) feeUsd!: string;
  @ApiProperty({ type: FeeByCurrencyDto }) fee!: FeeByCurrencyDto;
  @ApiProperty({ type: RatesByCurrencyDto }) rates!: RatesByCurrencyDto;
}

export class FeeDto {
  @ApiProperty({ example: '6.00', description: 'Cuota vigente para los periodos que se abran' })
  feeUsd!: string;
  @ApiProperty({ example: '2026-10' }) currentPeriod!: string;
  @ApiProperty({ example: '5.00', description: 'Cuota congelada del periodo actual' })
  currentPeriodFeeUsd!: string;
}
