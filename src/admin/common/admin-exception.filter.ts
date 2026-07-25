import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AdminExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AdminExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (!request.url?.startsWith('/api/admin')) {
      if (exception instanceof HttpException) {
        const status = exception.getStatus();
        const body = exception.getResponse();
        response.status(status).json(body);
        return;
      }
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
      );
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: 500,
        message: 'Internal server error',
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      let message = '请求失败';
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;
        if (Array.isArray(obj.message)) {
          message = obj.message.join('; ');
        } else if (typeof obj.message === 'string') {
          message = obj.message;
        } else if (typeof obj.error === 'string') {
          message = obj.error;
        }
      }
      response.status(status).json({
        success: false,
        message,
      });
      return;
    }

    this.logger.error(
      exception instanceof Error
        ? `${exception.name}: ${exception.message}`
        : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: '服务器内部错误',
    });
  }
}
