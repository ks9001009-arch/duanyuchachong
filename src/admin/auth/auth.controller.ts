import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthAdmin } from './jwt.strategy';

@ApiTags('admin-auth')
@Controller('api/admin/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@Req() req: Request & { user: AuthAdmin }) {
    return this.auth.me(req.user);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  changePassword(
    @Req() req: Request & { user: AuthAdmin },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(req.user, dto);
  }
}
