import {
  leadHasContent,
  normalizePhone,
  parseLeadText,
  shouldAutoImportGroupText,
  GROUP_ID_UPLOAD_REMINDER,
} from '../src/customer/group-lead-parse';

describe('group-lead-parse', () => {
  it('规范化电话', () => {
    expect(normalizePhone('+95 9-123 4567')).toBe('+9591234567');
    expect(normalizePhone('09-123-45678')).toBe('0912345678');
    expect(normalizePhone('123')).toBeNull();
  });

  it('解析多行键值', () => {
    const parsed = parseLeadText(
      ['用户名: @demo_user', '昵称: 张三', '电话: 0912345678', '需求: 要货到仰光'].join(
        '\n',
      ),
    );
    expect(parsed.username).toBe('demo_user');
    expect(parsed.nickname).toBe('张三');
    expect(parsed.phone).toBe('0912345678');
    expect(parsed.requirement).toBe('要货到仰光');
    expect(leadHasContent(parsed)).toBe(true);
    expect(shouldAutoImportGroupText(parsed)).toBe(true);
  });

  it('宽松解析 @与电话', () => {
    const parsed = parseLeadText('@alex 0911222333 需要咨询');
    expect(parsed.username).toBe('alex');
    expect(parsed.phone).toContain('0911222333');
    expect(shouldAutoImportGroupText(parsed)).toBe(true);
  });

  it('仅昵称不自动录入（避免闲聊误触发）', () => {
    const parsed = parseLeadText('好的收到');
    expect(shouldAutoImportGroupText(parsed)).toBe(false);
  });

  it('提醒文案固定', () => {
    expect(GROUP_ID_UPLOAD_REMINDER).toContain(
      '接待号私聊机器人上传该用户记录ID数据',
    );
  });
});
