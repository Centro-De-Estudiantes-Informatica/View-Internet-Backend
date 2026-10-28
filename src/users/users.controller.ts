import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProfileDto } from '../auth/dto/session.dto';
import {
  ChangeRoleDto,
  CreatedUserDto,
  CreateUserDto,
  ListUsersQuery,
  TemporaryPasswordDto,
  UpdateUserDto,
  UserPageDto,
} from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Crear persona con contraseña temporal' })
  @ApiCreatedResponse({ type: CreatedUserDto })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser): Promise<CreatedUserDto> {
    return this.users.create(dto, actor.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listado paginado con búsqueda y estado del periodo' })
  @ApiOkResponse({ type: UserPageDto })
  list(@Query() query: ListUsersQuery): Promise<UserPageDto> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProfileDto })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProfileDto> {
    return this.users.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar nombre/teléfono o activar/desactivar la cuenta' })
  @ApiOkResponse({ type: ProfileDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ProfileDto> {
    return this.users.update(id, dto, actor.id);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Cambiar el rol (no el propio; siempre queda un administrador)' })
  @ApiOkResponse({ type: ProfileDto })
  changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ProfileDto> {
    return this.users.changeRole(id, dto.role, actor.id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restablecer contraseña; invalida las sesiones de esa persona' })
  @ApiOkResponse({ type: TemporaryPasswordDto })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<TemporaryPasswordDto> {
    return this.users.resetPassword(id, actor.id);
  }
}
