/**
 * 版本号比较（不引依赖）：三段数字逐位比，缺位补 0，允许前缀 v。
 * 与 app.getVersion() / GitHub Release 的 tag 配套使用。
 */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) =>
    value
      .replace(/^v/i, '')
      .split('.')
      .map((segment) => Number.parseInt(segment, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < 3; index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}
