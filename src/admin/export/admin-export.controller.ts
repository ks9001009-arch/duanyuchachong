import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminExportService } from './admin-export.service';

@ApiTags('admin-export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/admin/export')
export class AdminExportController {
  constructor(private readonly exportService: AdminExportService) {}

  /**
   * 导出客户工作表（xlsx）：
   * 电报昵称 / 电报用户名 / 绑定号码 / 电报ID
   */
  @Get('backup')
  @Header('Cache-Control', 'no-store')
  async backup(@Res() res: Response) {
    const buffer = await this.exportService.buildCustomerWorkbookBuffer();
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    const filename = `duanyu-customers-${stamp}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.status(200).send(buffer);
  }

  /** 纯文本清单（兼容） */
  @Get('backup-txt')
  @Header('Cache-Control', 'no-store')
  async backupTxt(@Res() res: Response) {
    const text = await this.exportService.buildCustomerExportText();
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    const filename = `duanyu-customers-${stamp}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.status(200).send(text);
  }

  /** 全量 JSON 系统备份（不含管理员密码哈希） */
  @Get('backup-json')
  @Header('Cache-Control', 'no-store')
  async backupJson(@Res() res: Response) {
    const payload = await this.exportService.buildFullBackup();
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    const filename = `duanyu-backup-${stamp}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.status(200).send(JSON.stringify(payload, null, 2));
  }
}
