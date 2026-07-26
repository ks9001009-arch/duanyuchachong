/** 判断是否为 Telegram long polling 多实例冲突（409）。 */
export function isTelegramGetUpdatesConflict(message: string): boolean {
  return (
    message.includes('409') ||
    /getUpdates/i.test(message) ||
    /Conflict/i.test(message)
  );
}
