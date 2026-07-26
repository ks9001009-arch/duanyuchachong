/**
 * 按接待员 Telegram ID 隔离的临时交互状态（初版内存 Map）。
 * 禁止使用全局单一变量，避免多接待员互相覆盖。
 */
export type OperatorSession =
  | {
      mode: 'RESOLVE_SELECT';
      pendingCode: string;
      requestId: number;
      createdAt: number;
    }
  | {
      mode: 'USER_PICKER_SINGLE';
      requestId: number;
      createdAt: number;
    }
  | {
      mode: 'USER_PICKER_BATCH';
      requestId: number;
      createdAt: number;
    }
  | {
      mode: 'QUERY_USER_ID';
      requestId: number;
      createdAt: number;
    };

const SESSION_TTL_MS = 30 * 60 * 1000;

export class OperatorSessionStore {
  private readonly sessions = new Map<string, OperatorSession>();

  private key(operatorId: bigint): string {
    return operatorId.toString();
  }

  set(operatorId: bigint, session: OperatorSession): void {
    this.sessions.set(this.key(operatorId), session);
  }

  get(operatorId: bigint): OperatorSession | undefined {
    const session = this.sessions.get(this.key(operatorId));
    if (!session) return undefined;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(this.key(operatorId));
      return undefined;
    }
    return session;
  }

  clear(operatorId: bigint): void {
    this.sessions.delete(this.key(operatorId));
  }
}

/** 生成合法的 32 位有符号整数 request_id */
export function createRequestId(): number {
  const max = 2_147_483_647;
  return Math.floor(Math.random() * max) + 1;
}
