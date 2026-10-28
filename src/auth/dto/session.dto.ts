import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class ProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'V-28.123.456' }) cedula!: string;
  @ApiProperty() fullName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty() active!: boolean;
  @ApiProperty() mustChangePassword!: boolean;
  @ApiProperty() createdAt!: Date;
}

export class SessionDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: 'Bearer';
  @ApiProperty({ description: 'Segundos de validez del token' }) expiresIn!: number;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty() mustChangePassword!: boolean;
  @ApiProperty({ type: ProfileDto }) user!: ProfileDto;
}
