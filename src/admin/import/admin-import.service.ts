import { Injectable, Logger } from '@nestjs/common';
import { CustomerImportSource, PendingFailureReason } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { CustomerRegistryService } from '../../customer/customer-registry.service';
import { buildDisplayName } from '../../common/utils';
import {
  ExportLeadRecord,
  parseTelegramExportHtml,
} from './telegram-export-parse';

export type TelegramHtmlImportResult = {
  files: number;
  parsed: number;
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
};

@Injectable()
export class AdminImportService {
  private readonly logger = new Logger(AdminImportService.name);

  constructor(
    private readonly registry: CustomerRegistryService,
    private readonly config: AppConfigService,
  ) {}

  async importTelegramHtmlFiles(
    files: Array<{ originalname: string; buffer: Buffer }>,
  ): Promise<TelegramHtmlImportResult> {
    const allRecords: ExportLeadRecord[] = [];
    const batchKeys = new Set<string>();

    for (const file of files) {
      const html = file.buffer.toString('utf8');
      const records = parseTelegramExportHtml(html);
      for (const record of records) {
        if (batchKeys.has(record.key)) continue;
        batchKeys.add(record.key);
        allRecords.push(record);
      }
    }

    const operator = {
      telegramId: this.config.adminSystemOperatorTelegramId,
      username: 'admin-import',
      displayName: buildDisplayName('后台导入', null),
    };

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const record of allRecords) {
      try {
        const matches = await this.registry.softDedupSearch({
          username: record.username,
          nickname: record.nickname,
          phone: record.phone,
        });
        if (matches.customers.length > 0 || matches.pendings.length > 0) {
          skipped += 1;
          continue;
        }

        const noteParts: string[] = ['来源:Telegram导出HTML'];
        if (record.phone) noteParts.push(`电话:${record.phone}`);

        await this.registry.createPendingCustomer({
          visibleName: record.nickname,
          visibleUsername: record.username,
          note: noteParts.join('；'),
          failureReason: PendingFailureReason.MANUAL_PENDING,
          operator,
          source: CustomerImportSource.MANUAL_ID,
        });
        created += 1;
      } catch (error) {
        failed += 1;
        const msg = error instanceof Error ? error.message : String(error);
        if (errors.length < 20) {
          errors.push(
            `${record.username ? `@${record.username}` : record.phone ?? '?'}: ${msg}`,
          );
        }
        this.logger.warn(`导入跳过失败记录：${msg}`);
      }
    }

    return {
      files: files.length,
      parsed: allRecords.length,
      created,
      skipped,
      failed,
      errors,
    };
  }
}
