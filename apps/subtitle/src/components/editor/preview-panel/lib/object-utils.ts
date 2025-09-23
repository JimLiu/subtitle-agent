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

export function resolve<T>(value: T | ((...args: unknown[]) => T), args: unknown[] = []): T {
  if (typeof value === 'function') {
    return (value as (...params: unknown[]) => T)(...args);
  }
  return value;
}
