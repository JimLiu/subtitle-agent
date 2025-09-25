export function round(value: number): number {
  return (value + 0.5) << 0;
}

export function ceil(value: number): number {
  const integral = value << 0;
  return integral === value ? integral : integral + 1;
}

export function floor(value: number): number {
  return value | 0;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function decimals(value: number): number {
  if (value % 1 !== 0) {
    return value.toString().split('.')[1]?.length ?? 0;
  }
  return 0;
}

export function roundTo(value: number, step: number): number {
  const fractionDigits = decimals(step);
  const result = ceil(value / step) * step;
  return fractionDigits > 0 ? Number(result.toFixed(fractionDigits)) : result;
}

export function normalize(value: number, min: number, max: number): number {
  return clamp((value - min) / (max - min), 0, 1);
}

export function log10(value: number): number {
  return Math.log(value) / Math.LN10;
}

export function db2mag(value: number): number {
  return Math.exp(0.1151292546497023 * value);
}

export function mag2db(value: number): number {
  return 20 * log10(value);
}

export function deg2rad(value: number): number {
  return (Math.PI / 180) * value;
}

export function rad2deg(value: number): number {
  return (180 / Math.PI) * value;
}

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
