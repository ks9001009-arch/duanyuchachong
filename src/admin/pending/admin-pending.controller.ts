import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthAdmin } from '../auth/jwt.strategy';
import { AdminPendingService } from './admin-pending.service';
import { PendingListQueryDto, ResolvePendingDto } from './dto/pending.dto';

@ApiTags('admin-pending')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/admin/pending-customers')
export class AdminPendingController {
  constructor(private readonly pending: AdminPendingService) {}

  @Get()
  list(@Query() query: PendingListQueryDto) {
    return this.pending.list(query);
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.pending.getById(id);
  }

  @Post(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolvePendingDto,
    @Req() req: Request & { user: AuthAdmin },
  ) {
    return this.pending.resolve(id, dto, req.user);
  }
}
