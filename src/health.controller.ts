import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  root() {
    return { ok: true, service: 'telegram-customer-registry-bot' };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
