import {
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ok } from '../common/admin-response';
import { AdminImportService } from './admin-import.service';

@ApiTags('admin-import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/admin/import')
export class AdminImportController {
  constructor(private readonly importService: AdminImportService) {}

  @Post('telegram-html')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async importTelegramHtml(
    @UploadedFiles()
    files?: Array<{ originalname: string; buffer: Buffer; mimetype?: string }>,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('请至少上传一个 messages*.html 文件');
    }

    const htmlFiles = files.filter((f) =>
      /\.html?$/i.test(f.originalname || ''),
    );
    if (htmlFiles.length === 0) {
      throw new BadRequestException('未识别到 HTML 文件，请上传 messages*.html');
    }

    const result = await this.importService.importTelegramHtmlFiles(
      htmlFiles.map((f) => ({
        originalname: f.originalname,
        buffer: f.buffer,
      })),
    );
    return ok(result);
  }
}
