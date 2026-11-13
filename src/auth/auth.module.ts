import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { AppConfig } from '../config/app-config.service';
import { AuthStateService } from './auth-state.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { resolveClientIp } from './client-ip';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MustChangePasswordGuard } from './guards/must-change-password.guard';
import { RolesGuard } from './guards/roles.guard';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
    // Límite por IP solo para /auth/login (se aplica con ThrottlerGuard en esa ruta).
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          {
            name: 'login',
            ttl: config.get('LOGIN_WINDOW_MS'),
            limit: config.get('LOGIN_IP_LIMIT'),
          },
        ],
        // La IP real del navegador la manda la web en X-Client-IP, firmada con CLIENT_IP_SECRET.
        getTracker: (req) => resolveClientIp(req as Request, config.get('CLIENT_IP_SECRET')),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthStateService,
    LoginAttemptsService,
    PasswordService,
    // Orden: autenticación → cambio de contraseña pendiente → rol.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MustChangePasswordGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthStateService, PasswordService],
})
export class AuthModule {}
