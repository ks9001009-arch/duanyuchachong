import { DynamicModule, Logger, Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function resolveAdminWebDist(): string | null {
  const candidates = [
    join(process.cwd(), 'admin-web', 'dist'),
    join(__dirname, '..', 'admin-web', 'dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

/**
 * 同源托管 React 管理后台。
 * Nest 11 / path-to-regexp v8 排除语法：/api/{*any}
 */
@Module({})
export class AdminWebStaticModule {
  static forRoot(): DynamicModule {
    const adminDistPath = resolveAdminWebDist();
    if (!adminDistPath) {
      Logger.warn(
        `管理后台静态资源未找到（cwd=${process.cwd()}）。请确认 pnpm build 已包含 build:admin。`,
        'AdminWebStatic',
      );
      return { module: AdminWebStaticModule };
    }

    Logger.log(`管理后台静态目录：${adminDistPath}`, 'AdminWebStatic');

    return {
      module: AdminWebStaticModule,
      imports: [
        ServeStaticModule.forRoot({
          rootPath: adminDistPath,
          exclude: ['/api/{*any}', '/health', '/health/{*any}'],
        }),
      ],
    };
  }
}
