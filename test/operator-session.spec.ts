import { OperatorSessionStore, createRequestId } from '../src/telegram/operator-session.store';

describe('OperatorSessionStore', () => {
  it('按操作员隔离会话，互不覆盖', () => {
    const store = new OperatorSessionStore();
    store.set(111n, {
      mode: 'RESOLVE_SELECT',
      pendingCode: 'P000001',
      requestId: 1,
      createdAt: Date.now(),
    });
    store.set(222n, {
      mode: 'USER_PICKER_SINGLE',
      requestId: 2,
      createdAt: Date.now(),
    });

    expect(store.get(111n)?.mode).toBe('RESOLVE_SELECT');
    expect(store.get(222n)?.mode).toBe('USER_PICKER_SINGLE');
    store.clear(111n);
    expect(store.get(111n)).toBeUndefined();
    expect(store.get(222n)?.requestId).toBe(2);
  });

  it('createRequestId 返回合法 32 位正整数', () => {
    for (let i = 0; i < 20; i++) {
      const id = createRequestId();
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThanOrEqual(2_147_483_647);
      expect(Number.isInteger(id)).toBe(true);
    }
  });
});
