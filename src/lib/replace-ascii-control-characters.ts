/**
 * Replace ASCII C0 and DEL control characters without using control-character
 * regular expressions. This keeps filename/search sanitization compatible
 * with the project's ESLint no-control-regex rule.
 */
export function replaceAsciiControlCharacters(value: string, replacement: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    result += codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
      ? replacement
      : character;
  }
  return result;
}
