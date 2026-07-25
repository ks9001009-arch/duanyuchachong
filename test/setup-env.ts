process.env.ADMIN_INITIAL_USERNAME =
  process.env.ADMIN_INITIAL_USERNAME || 'admin';
process.env.ADMIN_INITIAL_PASSWORD =
  process.env.ADMIN_INITIAL_PASSWORD || 'test-password-123456';
process.env.ADMIN_JWT_SECRET =
  process.env.ADMIN_JWT_SECRET || 'test-jwt-secret-min-16-chars';
process.env.ADMIN_JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || '8h';
process.env.ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID =
  process.env.ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID || '900001';
process.env.APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Yangon';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
