import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PERIOD_RE } from '../../common/domain/period';
import { PERIOD_STATUSES, type PeriodStatus } from '../../common/domain/period-status';
import { ProfileDto } from '../../auth/dto/session.dto';

const PHONE_RE = /^\+?\d{7,15}$/;
const trimPhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s\-().]/g, '') : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUserDto {
  @ApiProperty({ example: 'V-30.555.111' })
  @IsString()
  @MaxLength(20)
  cedula!: string;

  @ApiProperty({ example: 'José Rodríguez' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ example: '04141234567' })
  @IsOptional()
  @Transform(trimPhone)
  @Matches(PHONE_RE, { message: 'phone debe tener entre 7 y 15 dígitos' })
  phone?: string;

  @ApiPropertyOptional({ enum: Role, default: Role.ESTUDIANTE })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'null para borrarlo' })
  @IsOptional()
  @Transform(trimPhone)
  @ValidateIf((_o, v) => v !== null)
  @Matches(PHONE_RE, { message: 'phone debe tener entre 7 y 15 dígitos' })
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ChangeRoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;
}

export class ListUsersQuery {
  @ApiPropertyOptional({ description: 'Cédula (3+ dígitos) o nombre, sin importar acentos' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: PERIOD_STATUSES })
  @IsOptional()
  @IsIn(PERIOD_STATUSES)
  estado?: PeriodStatus;

  @ApiPropertyOptional({ example: '2026-10', description: 'Por defecto, el periodo actual' })
  @IsOptional()
  @Matches(PERIOD_RE, { message: 'periodo debe tener el formato AAAA-MM' })
  periodo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;

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

export class UserPeriodDto {
  @ApiProperty({ example: '2026-10' }) periodo!: string;
  @ApiProperty({ enum: PERIOD_STATUSES }) status!: PeriodStatus;
  @ApiProperty({ example: '3.00' }) paidUsd!: string;
  @ApiProperty({ example: '5.00' }) feeUsd!: string;
}

export class UserListItemDto extends ProfileDto {
  @ApiProperty({
    type: UserPeriodDto,
    nullable: true,
    description: 'null si no hay cuota configurada',
  })
  period!: UserPeriodDto | null;
}

export class UserPageDto {
  @ApiProperty({ type: [UserListItemDto] }) items!: UserListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export class CreatedUserDto {
  @ApiProperty({ type: ProfileDto }) user!: ProfileDto;
  @ApiProperty({ description: 'Se muestra una sola vez' }) temporaryPassword!: string;
}

export class TemporaryPasswordDto {
  @ApiProperty({ description: 'Se muestra una sola vez' }) temporaryPassword!: string;
}
