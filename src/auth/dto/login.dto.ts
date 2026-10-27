import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'V-28.123.456', description: 'Con o sin puntos, guiones ni prefijo' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  cedula!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
