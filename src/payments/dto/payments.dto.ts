import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, PaymentMethod, PaymentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DATE_RE, PERIOD_RE } from '../../common/domain/period';
import { PERIOD_STATUSES, type PeriodStatus } from '../../common/domain/period-status';
import { IsPositiveDecimalString } from '../../common/validation/decimal-string';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const digitsOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s\-().]/g, '') : value;

export class CashPaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: '2026-10' })
  @Matches(PERIOD_RE, { message: 'periodo debe tener el formato AAAA-MM' })
  periodo!: string;

  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  currency!: Currency;

  @ApiProperty({ example: '5.00' })
  @IsPositiveDecimalString(2, 16)
  amount!: string;

  @ApiPropertyOptional({ example: '2026-10-26', description: 'Por defecto, hoy' })
  @IsOptional()
  @Matches(DATE_RE, { message: 'paidAt debe tener el formato AAAA-MM-DD' })
  paidAt?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Campos de `multipart/form-data`; la captura opcional va en el campo `receipt`. */
export class MobilePaymentDto {
  @ApiProperty({ example: '004512', description: 'Número de referencia del pago móvil' })
  @Transform(digitsOnly)
  @Matches(/^\d{4,20}$/, { message: 'reference debe tener entre 4 y 20 dígitos' })
  reference!: string;

  @ApiProperty({ example: '0134', description: 'Código del banco de origen (4 dígitos)' })
  @Transform(trim)
  @Matches(/^\d{4}$/, { message: 'bank debe ser el código de 4 dígitos del banco' })
  bank!: string;

  @ApiProperty({ example: '04141234567' })
  @Transform(digitsOnly)
  @Matches(/^\+?\d{7,15}$/, { message: 'payerPhone debe tener entre 7 y 15 dígitos' })
  payerPhone!: string;

  @ApiProperty({ example: '2026-10-26' })
  @Matches(DATE_RE, { message: 'paidAt debe tener el formato AAAA-MM-DD' })
  paidAt!: string;

  @ApiProperty({ example: '1000.00' })
  @IsPositiveDecimalString(2, 16)
  amount!: string;

  @ApiPropertyOptional({ enum: Currency, default: Currency.VES, description: 'Solo VES' })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ example: '2026-10', description: 'Por defecto, el periodo actual' })
  @IsOptional()
  @Matches(PERIOD_RE, { message: 'periodo debe tener el formato AAAA-MM' })
  periodo?: string;
}

/** Solo para el OpenAPI: el formulario incluye el archivo, que no pasa por la validación del body. */
export class MobilePaymentFormDto extends MobilePaymentDto {
  @ApiPropertyOptional({ type: 'string', format: 'binary', description: 'JPG o PNG, máx. 5 MB' })
  receipt?: unknown;
}

export class ReasonDto {
  @ApiProperty({ example: 'La referencia no aparece en el banco' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ApproveDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListPaymentsQuery {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ example: '2026-10' })
  @IsOptional()
  @Matches(PERIOD_RE, { message: 'periodo debe tener el formato AAAA-MM' })
  periodo?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class PaymentUserDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'V-28.123.456' }) cedula!: string;
  @ApiProperty() fullName!: string;
}

export class PaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: PaymentUserDto }) user!: PaymentUserDto;
  @ApiProperty({ example: '2026-10' }) periodo!: string;
  @ApiProperty({ enum: PaymentMethod }) method!: PaymentMethod;
  @ApiProperty({ enum: Currency }) currency!: Currency;
  @ApiProperty({ example: '1000.00' }) amount!: string;
  @ApiProperty({ example: '200.0000' }) rate!: string;
  @ApiProperty({ example: '2026-10-26', nullable: true, type: String }) rateDate!: string | null;
  @ApiProperty({ example: '5.00' }) amountUsd!: string;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty({ nullable: true, type: String }) reference!: string | null;
  @ApiProperty({ nullable: true, type: String }) bank!: string | null;
  @ApiProperty({ nullable: true, type: String }) payerPhone!: string | null;
  @ApiProperty({ example: '2026-10-26' }) paidAt!: string;
  @ApiProperty() hasReceipt!: boolean;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ nullable: true, type: String }) registeredBy!: string | null;
  @ApiProperty({ nullable: true, type: String }) reviewedBy!: string | null;
  @ApiProperty({ nullable: true, type: Date }) reviewedAt!: Date | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Motivo de rechazo o nota de aprobación',
  })
  reviewNote!: string | null;
  @ApiProperty({ nullable: true, type: String }) voidedBy!: string | null;
  @ApiProperty({ nullable: true, type: Date }) voidedAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) voidReason!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class PaymentPageDto {
  @ApiProperty({ type: [PaymentDto] }) items!: PaymentDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class ReceiptUrlDto {
  @ApiProperty() url!: string;
  @ApiProperty({ example: 300 }) expiresIn!: number;
}

export class PeriodBalanceDto {
  @ApiProperty({ example: '2026-10' }) periodo!: string;
  @ApiProperty({ enum: PERIOD_STATUSES }) status!: PeriodStatus;
  @ApiProperty({ example: '5.00' }) feeUsd!: string;
  @ApiProperty({ example: '3.00' }) paidUsd!: string;
  @ApiProperty({ example: '2.00' }) balanceUsd!: string;
  @ApiProperty() inReviewCount!: number;
}

export class AmountByCurrencyDto {
  @ApiProperty({ example: '2.00' }) USD!: string;
  @ApiProperty({ example: '400.00', nullable: true, type: String }) VES!: string | null;
  @ApiProperty({ example: '8000.00', nullable: true, type: String }) COP!: string | null;
}

export class MyStatusDto {
  @ApiProperty({ type: PeriodBalanceDto }) current!: PeriodBalanceDto;
  @ApiProperty({
    type: [PeriodBalanceDto],
    description: 'Periodos no saldados, del más antiguo al más reciente',
  })
  owedPeriods!: PeriodBalanceDto[];
  @ApiProperty({ type: AmountByCurrencyDto, description: 'Total pendiente a las tasas vigentes' })
  pending!: AmountByCurrencyDto;
}
