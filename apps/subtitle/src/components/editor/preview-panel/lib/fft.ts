export function computeFftMagnitudes(input: Float32Array, target?: number[]): number[] {
  if (!input) {
    throw new Error('Input waveform is not provided, pass input array.');
  }

  const size = input.length;
  const exponent = Math.floor(Math.log(size) / Math.LN2);
  if (2 ** exponent !== size) {
    throw new Error('Invalid array size, must be a power of 2.');
  }

  const result = target ?? new Array<number>(size / 2);
  const buffer = new Array<number>(size);
  const kTwoPi = 2 * Math.PI;
  const sqrt = Math.sqrt;
  const halfSize = size >>> 1;
  const scale = 2 / size;

  // bit reversal permutation
  (function permute(length: number, destination: number[], source: Float32Array) {
    const half = length >>> 1;
    const last = length - 1;
    let i = 1;
    let j = 0;
    destination[0] = source[0];
    do {
      j += half;
      destination[i] = source[j];
      destination[j] = source[i];
      i += 1;
      let k = half << 1;
      while (!((j ^= k >>= 1) & k)) {
        // iterate
      }
      if (j >= i) {
        destination[i] = source[j];
        destination[j] = source[i];
        destination[last - i] = source[last - j];
        destination[last - j] = source[last - i];
      }
      i += 1;
    } while (i < half);
    destination[last] = source[last];
  })(size, buffer, input);

  let step = 2;
  let loop = size >>> 1;
  while ((loop >>>= 1) > 0) {
    let start = 0;
    let stride = (step <<= 1) << 1;
    const quarter = step >>> 2;
    const eighth = step >>> 3;
    do {
      if (quarter !== 1) {
        for (let index = start; index < size; index += stride) {
          let a = index;
          let b = a + quarter;
          const c = b + quarter;
          let d = c + quarter;
          let temp = buffer[b] + buffer[d];
          buffer[d] -= buffer[b];
          buffer[b] = buffer[a] - temp;
          buffer[a] += temp;
          a += eighth;
          b += eighth;
          d += eighth;
          temp = buffer[b] + buffer[d];
          let diff = buffer[b] - buffer[d];
          temp *= -Math.SQRT1_2;
          diff *= Math.SQRT1_2;
          const value = buffer[c];
          buffer[d] = temp + value;
          buffer[b] = temp - value;
          buffer[c] = buffer[a] - diff;
          buffer[a] += diff;
        }
      } else {
        for (let index = start; index < size; index += stride) {
          const a = index;
          const b = a + quarter;
          const c = b + quarter;
          const d = c + quarter;
          const temp = buffer[b] + buffer[d];
          buffer[d] -= buffer[b];
          buffer[b] = buffer[a] - temp;
          buffer[a] += temp;
        }
      }
      start = (stride << 1) - step;
      stride <<= 2;
    } while (start < size);

    const omega = kTwoPi / step;
    for (let angleIndex = 1; angleIndex < eighth; angleIndex += 1) {
      const angle = angleIndex * omega;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const cosFactor = 4 * cos * (cos * cos - 0.75);
      const sinFactor = 4 * sin * (0.75 - sin * sin);
      let startInner = 0;
      let strideInner = step << 1;
      do {
        for (let index = startInner; index < size; index += strideInner) {
          const base = index + angleIndex;
          const quarterIndex = base + quarter;
          const halfIndex = quarterIndex + quarter;
          const threeQuarterIndex = halfIndex + quarter;
          const mirrorBase = index + quarter - angleIndex;
          const mirrorQuarter = mirrorBase + quarter;
          const mirrorHalf = mirrorQuarter + quarter;
          const mirrorThreeQuarter = mirrorHalf + quarter;

          let tempCos = buffer[mirrorQuarter] * cos - buffer[quarterIndex] * sin;
          let tempSin = buffer[mirrorQuarter] * sin + buffer[quarterIndex] * cos;
          let mixCos = buffer[mirrorThreeQuarter] * cosFactor - buffer[threeQuarterIndex] * sinFactor;
          let mixSin = buffer[mirrorThreeQuarter] * sinFactor + buffer[threeQuarterIndex] * cosFactor;
          let sum = tempCos - mixCos;
          tempCos += mixCos;
          mixCos = sum;
          buffer[mirrorThreeQuarter] = tempCos + buffer[mirrorHalf];
          buffer[quarterIndex] = tempCos - buffer[mirrorHalf];
          sum = mixSin - tempSin;
          tempSin += mixSin;
          mixSin = sum;
          buffer[threeQuarterIndex] = mixSin + buffer[halfIndex];
          buffer[mirrorQuarter] = mixSin - buffer[halfIndex];
          buffer[mirrorHalf] = buffer[base] - tempSin;
          buffer[base] += tempSin;
          buffer[halfIndex] = tempCos + buffer[mirrorBase];
          buffer[mirrorBase] -= tempCos;
        }
        startInner = (strideInner << 1) - step;
        strideInner <<= 2;
      } while (startInner < size);
    }
  }

  let remaining = halfSize;
  while (--remaining) {
    const real = buffer[remaining];
    const imag = buffer[size - remaining - 1];
    result[remaining] = scale * sqrt(real * real + imag * imag);
  }
  result[0] = Math.abs(scale * buffer[0]);
  return result;
}
