export function isSingleLine(value: string): boolean {
  return !/[\r\n]/.test(value);
}
