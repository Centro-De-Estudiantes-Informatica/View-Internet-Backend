import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { PERIOD_RE } from '../common/domain/period';
import { PaymentUserDto } from '../payments/dto/payments.dto';

export class SummaryQuery {
  @ApiPropertyOptional({ example: '2026-10', description: 'Por defecto, el periodo actual' })
  @IsOptional()
  @Matches(PERIOD_RE, { message: 'periodo debe tener el formato AAAA-MM' })
  periodo?: string;
}

export class MonthlyQuery {
  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months = 6;
}

export class RecentQuery {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}

export class CollectedDto {
  @ApiProperty({ example: '1000.00', description: 'Monto en la moneda original' }) amount!: string;
  @ApiProperty({ example: '5.00' }) amountUsd!: string;
  @ApiProperty() count!: number;
}

export class CollectedByCurrencyDto {
  @ApiProperty({ type: CollectedDto }) USD!: CollectedDto;
  @ApiProperty({ type: CollectedDto }) VES!: CollectedDto;
  @ApiProperty({ type: CollectedDto }) COP!: CollectedDto;
}

export class StudentsByStatusDto {
  @ApiProperty({ description: 'Estudiantes activos considerados en el periodo' }) total!: number;
  @ApiProperty() AL_DIA!: number;
  @ApiProperty() PARCIAL!: number;
  @ApiProperty() EN_REVISION!: number;
  @ApiProperty() PENDIENTE!: number;
}

export class InReviewDto {
  @ApiProperty({ description: 'Pagos EN_REVISION del periodo' }) period!: number;
  @ApiProperty({ description: 'Pagos EN_REVISION de todos los periodos (cola de revisión)' })
  total!: number;
}

export class SummaryDto {
  @ApiProperty({ example: '2026-10' }) periodo!: string;
  @ApiProperty({ example: '5.00' }) feeUsd!: string;
  @ApiProperty({ type: CollectedByCurrencyDto }) collected!: CollectedByCurrencyDto;
  @ApiProperty({ example: '120.00' }) totalUsd!: string;
  @ApiProperty({ example: '200.00', description: 'Estudiantes activos × cuota' })
  expectedUsd!: string;
  @ApiProperty({ example: '60.00', description: 'Porcentaje cobrado (0–100+)' })
  percentCollected!: string;
  @ApiProperty({ type: StudentsByStatusDto }) students!: StudentsByStatusDto;
  @ApiProperty({ type: InReviewDto }) inReview!: InReviewDto;
}

export class MonthlyPointDto {
  @ApiProperty({ example: '2026-10' }) periodo!: string;
  @ApiProperty({ example: '120.00' }) totalUsd!: string;
}

export class RecentPaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: PaymentUserDto }) user!: PaymentUserDto;
  @ApiProperty({ enum: PaymentMethod }) method!: PaymentMethod;
  @ApiProperty({ enum: Currency }) currency!: Currency;
  @ApiProperty({ example: '1000.00' }) amount!: string;
  @ApiProperty({ example: '5.00' }) amountUsd!: string;
  @ApiProperty({ example: '2026-10' }) periodo!: string;
  @ApiProperty({ example: '2026-10-26' }) paidAt!: string;
  @ApiProperty({ description: 'Momento en que quedó aprobado' }) approvedAt!: Date;
}
