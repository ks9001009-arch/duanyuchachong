import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async root() {
    return this.health();
  }

  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        service: 'telegram-customer-registry',
        database: 'connected',
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'telegram-customer-registry',
        database: 'disconnected',
      });
    }
  }
}
