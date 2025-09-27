/** 位运算近似四舍五入（仅适用于安全整数范围内） */
export function round(value: number): number {
  return (value + 0.5) << 0;
}

/** 位运算取上整（仅适用于安全整数范围内） */
export function ceil(value: number): number {
  const integral = value << 0;
  return integral === value ? integral : integral + 1;
}

/** 位运算向下取整（仅适用于安全整数范围内） */
export function floor(value: number): number {
  return value | 0;
}

/** 夹取到 [min, max] 区间 */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/** 获取小数位数 */
export function decimals(value: number): number {
  if (value % 1 !== 0) {
    return value.toString().split('.')[1]?.length ?? 0;
  }
  return 0;
}

/** 按步长向上取整并保持小数精度 */
export function roundTo(value: number, step: number): number {
  const fractionDigits = decimals(step);
  const result = ceil(value / step) * step;
  return fractionDigits > 0 ? Number(result.toFixed(fractionDigits)) : result;
}

/** 将 value 映射到 [0,1] */
export function normalize(value: number, min: number, max: number): number {
  return clamp((value - min) / (max - min), 0, 1);
}

export function log10(value: number): number {
  return Math.log(value) / Math.LN10;
}

/** dB 转线性幅值 */
export function db2mag(value: number): number {
  return Math.exp(0.1151292546497023 * value);
}

/** 线性幅值转 dB */
export function mag2db(value: number): number {
  return 20 * log10(value);
}

export function deg2rad(value: number): number {
  return (Math.PI / 180) * value;
}

export function rad2deg(value: number): number {
  return (180 / Math.PI) * value;
}

/** 简单的字符串哈希（非加密） */
export function hash(text: string): number {
  let hashValue = 0;
  if (text.length === 0) {
    return hashValue;
  }
  for (let index = 0; index < text.length; index += 1) {
    hashValue = (hashValue << 5) - hashValue + text.charCodeAt(index);
    hashValue |= 0;
  }
  return hashValue;
}
