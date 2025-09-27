/** Blackman 窗函数，降低频谱泄漏。 */
export function blackmanWindow(sampleIndex: number, totalSamples: number): number {
  const phase = (2 * Math.PI * sampleIndex) / (totalSamples - 1);
  return 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
}
