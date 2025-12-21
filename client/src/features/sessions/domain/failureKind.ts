export function formatFailureKind(kind: string | null | undefined): string | null {
  if (!kind) return null;
  const words = kind.split("_").filter((token) => token.length > 0);
  const formatted = words.map((word) => {
    const phaseMatch = /^phase(\d+)$/.exec(word);
    if (phaseMatch) {
      return `Phase ${phaseMatch[1]}`;
    }
    return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  });
  return formatted.join(" ");
}
