import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from './auth-user';
import { AuthService } from './auth.service';
import { AllowPendingPasswordChange } from './decorators/allow-pending-password-change.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { ProfileDto, SessionDto } from './dto/session.dto';

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión con cédula y contraseña' })
  @ApiOkResponse({ type: SessionDto })
  login(@Body() dto: LoginDto): Promise<SessionDto> {
    return this.auth.login(dto.cedula, dto.password);
  }

  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @Post('auth/change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar la contraseña; emite un token nuevo e invalida los anteriores',
  })
  @ApiOkResponse({ type: SessionDto })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<SessionDto> {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Perfil de la persona autenticada' })
  @ApiOkResponse({ type: ProfileDto })
  me(@CurrentUser() user: AuthUser): Promise<ProfileDto> {
    return this.auth.profile(user.id);
  }
}
