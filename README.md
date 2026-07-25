# Telegram Customer Registry Bot

独立运行的 Telegram 客户查重录入机器人初版。

技术栈：Node.js 22 · TypeScript · NestJS · Telegraf · Prisma · PostgreSQL · pnpm · Jest · Docker Compose

---

## 1. 创建 Bot

1. 在 Telegram 中打开 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot`，按提示设置名称与用户名
3. 复制得到的 Bot Token，填入 `.env` 的 `TELEGRAM_BOT_TOKEN`
4. 建议关闭 Privacy Mode（如需在群内读取转发消息）：向 BotFather 发送 `/setprivacy` → Disable

---

## 2. 填写环境变量

复制示例文件：

```bash
cp .env.example .env
```

| 变量 | 说明 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | BotFather 下发的 Token（本项目专用，勿复用其他项目） |
| `TELEGRAM_OPERATOR_IDS` | 授权接待员 Telegram ID，逗号分隔 |
| `TELEGRAM_ENTRY_CHAT_IDS` | 授权录入群 ID，逗号分隔（私聊不需要） |
| `TELEGRAM_ARCHIVE_CHAT_ID` | 统一客户存档群 ID |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `ADMIN_INITIAL_USERNAME` | 初始管理员用户名（仅首次创建） |
| `ADMIN_INITIAL_PASSWORD` | 初始管理员密码（必填，勿入库） |
| `ADMIN_JWT_SECRET` | JWT 密钥（必填，勿入库） |
| `ADMIN_JWT_EXPIRES_IN` | Token 有效期，默认 8h |
| `ADMIN_CORS_ORIGINS` | 后台前端域名白名单 |
| `APP_TIMEZONE` | 统计“今日”时区，默认 Asia/Yangon |
| `ENABLE_SWAGGER` | 是否开启 `/api/docs` |

---

## 3. 如何取得接待员 Telegram ID

任选其一：

- 让接待员私聊 [@userinfobot](https://t.me/userinfobot) 或 [@getidsbot](https://t.me/getidsbot)
- 把任意消息转发给 ID 查询机器人
- 临时在日志中打印 `message.from.id`

把数字 ID 写入 `TELEGRAM_OPERATOR_IDS`。

---

## 4. 创建统一存档群

1. 新建一个私有超级群（或公开群），命名如「客户录入存档」
2. 将本机器人添加为群成员
3. 建议赋予机器人发消息权限
4. 取得群 ID（可用 `@getidsbot`，或看更新中的 `chat.id`，通常形如 `-100xxxxxxxxxx`）
5. 填入 `TELEGRAM_ARCHIVE_CHAT_ID`（若该群也用于转发录入，同时加入 `TELEGRAM_ENTRY_CHAT_IDS`）

---

## 5. 把机器人加入群并配置权限

1. 群设置 → 添加成员 → 选择本机器人
2. 如需机器人发送存档卡片：允许「发送消息」
3. 如需在群内处理转发：建议关闭 Privacy Mode
4. 未在 `TELEGRAM_ENTRY_CHAT_IDS` 中的群，机器人不会主动回复

---

## 6. 本地运行

前置：Node.js 22+、pnpm、PostgreSQL。

```bash
pnpm install
cp .env.example .env
# 编辑 .env

pnpm prisma migrate deploy
pnpm prisma generate
pnpm start:dev
```

开发迁移（仅本地）：

```bash
pnpm prisma:migrate:dev
```

生产环境禁止使用 `prisma migrate dev`，请使用 `prisma migrate deploy`。

---

## 7. 使用 Docker

```bash
cp .env.example .env
# 填写 TELEGRAM_BOT_TOKEN、TELEGRAM_OPERATOR_IDS、TELEGRAM_ARCHIVE_CHAT_ID 等
# docker-compose 会覆盖 DATABASE_URL 指向服务 db

docker compose up -d --build
```

容器启动时会自动执行：

```bash
pnpm prisma migrate deploy
```

查看日志：

```bash
docker compose logs -f bot
```

---

## 8. 备份数据库

Docker Compose 卷备份示例：

```bash
docker compose exec db pg_dump -U registry customer_registry > backup.sql
```

恢复：

```bash
docker compose exec -T db psql -U registry customer_registry < backup.sql
```

---

## 9. 常用操作

### 查询正式客户

```text
/id 123456789
```

### 查询待确认客户

```text
/pending P000123
```

### 用户名 / 昵称辅助查询

```text
/username zhangsan
/name 张三
```

昵称与用户名仅供辅助，**不能**作为精准查重依据。

### 补充 Telegram ID

```text
/resolve P000123 123456789
```

或：

```text
/resolve_select P000123
```

再通过用户选择器选中对应客户。

菜单「🔍 选择客户查重」「📥 批量选择客户」用于正式录入；转发隐藏来源会自动生成待确认记录。

---

## 10. Telegram 限制说明

### 隐藏转发来源

若客户在隐私设置中隐藏转发来源，转发消息拿不到 Telegram ID。本机器人会保存为 `PENDING_ID` 待确认客户（临时编号如 `P000123`），后续再补充 ID。

### 私聊消息链接

客户与接待员之间的私聊消息，无法生成让其他接待员通用访问的链接。系统**不会**保存客户原私聊链接；查询结果中的「点击查看」一律指向统一存档群中的机器人存档卡片。

---

## 11. 测试与编译

```bash
pnpm test
pnpm build
```

---

## 12. 管理后台 API（当前阶段：仅后端）

后台与机器人共用同一 PostgreSQL。前端域名计划为 `duan-yu.com`（本阶段不部署 React）。

### 12.1 初始管理员

在 `.env` / Render 配置：

```env
ADMIN_INITIAL_USERNAME=admin
ADMIN_INITIAL_PASSWORD=请使用高强度密码
ADMIN_JWT_SECRET=请使用至少16位随机密钥
ADMIN_JWT_EXPIRES_IN=8h
ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID=请填写专用系统操作者Telegram数字ID（大于0）
ADMIN_CORS_ORIGINS=http://localhost:5173,https://duan-yu.com,https://www.duan-yu.com
APP_TIMEZONE=Asia/Yangon
ENABLE_SWAGGER=true
```

- 仅当数据库中**没有任何**管理员时，启动会创建初始账号。
- **已存在管理员时不会覆盖密码**。
- **禁止**把 `ADMIN_INITIAL_PASSWORD` / `ADMIN_JWT_SECRET` 提交到 Git。

### 12.2 JWT 登录

```bash
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"你的密码"}'
```

之后请求携带：

```text
Authorization: Bearer <accessToken>
```

修改密码：

```text
POST /api/admin/auth/change-password
{"oldPassword":"...","newPassword":"至少8位"}
```

### 12.3 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/auth/login` | 登录 |
| GET | `/api/admin/auth/me` | 当前管理员 |
| POST | `/api/admin/auth/change-password` | 改密 |
| GET | `/api/admin/dashboard/summary` | 仪表盘统计 |
| GET | `/api/admin/customers` | 正式客户列表 |
| GET | `/api/admin/customers/:id` | 客户详情 |
| GET | `/api/admin/customers/by-telegram-id/:telegramId` | ID 精准定位 |
| GET | `/api/admin/pending-customers` | 待确认列表 |
| GET | `/api/admin/pending-customers/:id` | 待确认详情 |
| POST | `/api/admin/pending-customers/:id/resolve` | 后台补充身份 |
| GET | `/api/admin/import-logs` | 录入日志 |
| GET | `/api/admin/admin-login-logs` | 管理员登录日志 |
| GET | `/health` | 健康检查 |

Swagger（非生产或 `ENABLE_SWAGGER=true`）：`/api/docs`

### 12.4 管理员账号丢失恢复

1. 用有权限的数据库客户端连接生产库；
2. 备份后删除或重置 `AdminUser`（仅紧急情况）；
3. 设置新的 `ADMIN_INITIAL_PASSWORD` 后重启服务，仅在无管理员时会重建；
4. 或直接更新 `passwordHash`（bcrypt）后登录再改密。

### 12.5 Render 需新增环境变量

- `ADMIN_INITIAL_USERNAME`
- `ADMIN_INITIAL_PASSWORD`
- `ADMIN_JWT_SECRET`
- `ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID`
- `ADMIN_JWT_EXPIRES_IN`
- `ADMIN_CORS_ORIGINS`
- `APP_TIMEZONE`
- `ENABLE_SWAGGER`（生产建议 `false`）

部署前执行迁移：`pnpm prisma migrate deploy`（Docker/Render start 命令已包含）。

---

## 13. 项目结构（摘要）

```text
src/
  admin/           后台 API（认证、仪表盘、客户、待确认、日志）
  config/          环境变量与权限
  prisma/          PrismaService
  counter/         原子编号
  customer/        CustomerRegistryService 统一查重录入
  telegram/        Telegraf long polling 交互
prisma/            schema 与迁移
test/              Jest 测试
```
