import { Module, Logger } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const adminDistPath = join(__dirname, '..', 'admin-web', 'dist');
const adminIndexPath = join(adminDistPath, 'index.html');
const adminWebReady = existsSync(adminIndexPath);

if (!adminWebReady) {
  Logger.warn(
    `管理后台静态资源未找到：${adminIndexPath}（跳过静态托管；请先执行 pnpm build:admin）`,
    'AdminWebStatic',
  );
}

/**
 * 同源托管 React 管理后台。
 * exclude 确保 /api/**、/health 不被 SPA 拦截。
 */
@Module({
  imports: adminWebReady
    ? [
        ServeStaticModule.forRoot({
          rootPath: adminDistPath,
          exclude: ['/api/(.*)', '/health', '/health/(.*)'],
        }),
      ]
    : [],
})
export class AdminWebStaticModule {}
