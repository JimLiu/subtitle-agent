/**
 * 仅更新 target 中已存在的属性（忽略 undefined 与不存在的 key）。
 * 返回值表示是否发生任何变更。
 */
export function updateExistingProps<T extends Record<string, unknown>>(target: T, source: Partial<T>): boolean {
  let changed = false;
  Object.keys(source).forEach((key) => {
    if (key in target) {
      const value = source[key as keyof T];
      if (value !== undefined && target[key as keyof T] !== value) {
        target[key as keyof T] = value as T[keyof T];
        changed = true;
      }
    }
  });
  return changed;
}

/**
 * 若传入为函数则调用后返回结果，否则直接返回原值。
 */
export function resolve<T>(value: T | ((...args: unknown[]) => T), args: unknown[] = []): T {
  if (typeof value === 'function') {
    return (value as (...params: unknown[]) => T)(...args);
  }
  return value;
}
