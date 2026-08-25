// 生成唯一ID
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 格式化日期
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 获取当前时间
export function now(): string {
  return formatDate(new Date());
}

// 获取当前时间戳
export function timestamp(): string {
  return new Date().toISOString();
}

// 比较日期，用于排序（升序）
export function compareDate(a: string, b: string): number {
  return a.localeCompare(b);
}
