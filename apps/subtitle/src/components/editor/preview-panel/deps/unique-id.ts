export function uniqueId(): number {
  // 基于时间戳与随机数的简单唯一标识（足够用于本地处理）
  return Date.now() * Math.random();
}
