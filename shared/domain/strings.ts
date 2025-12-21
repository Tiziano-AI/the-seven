/**
 * Returns true when the string does not contain line breaks.
 */
export function isSingleLine(value: string): boolean {
  return !/[\r\n]/.test(value);
}
