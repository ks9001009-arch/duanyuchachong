import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminCustomersService } from './admin-customers.service';
import { CustomerListQueryDto } from './dto/customer-query.dto';

@ApiTags('admin-customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/admin/customers')
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomersService) {}

  @Get()
  list(@Query() query: CustomerListQueryDto) {
    return this.customers.list(query);
  }

  @Get('by-telegram-id/:telegramId')
  byTelegramId(@Param('telegramId') telegramId: string) {
    return this.customers.getByTelegramId(telegramId);
  }

  @Get(':id')
  byId(@Param('id') id: string) {
    return this.customers.getById(id);
  }
}
