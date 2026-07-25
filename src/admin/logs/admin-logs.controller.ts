import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminLogsService } from './admin-logs.service';
import { AdminLoginLogQueryDto, ImportLogQueryDto } from './dto/log-query.dto';

@ApiTags('admin-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/admin')
export class AdminLogsController {
  constructor(private readonly logs: AdminLogsService) {}

  @Get('import-logs')
  importLogs(@Query() query: ImportLogQueryDto) {
    return this.logs.importLogs(query);
  }

  @Get('admin-login-logs')
  loginLogs(@Query() query: AdminLoginLogQueryDto) {
    return this.logs.adminLoginLogs(query);
  }
}
