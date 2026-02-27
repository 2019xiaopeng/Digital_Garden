export function normalizeMathDelimiters(input: string): string {
  if (!input) return "";
  let text = input.replace(/\r\n/g, "\n");

  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_full, inner: string) => `\n$$\n${inner.trim()}\n$$\n`);
  text = text.replace(/\\\(([^\n]+?)\\\)/g, (_full, inner: string) => `$${inner.trim()}$`);

  return text;
}

export function toPlainPreview(markdown: string, maxLength = 120): string {
  const normalized = normalizeMathDelimiters(markdown || "");

  const stripped = normalized
    .replace(/\$\$[\s\S]*?\$\$/g, " [公式] ")
    .replace(/\$[^$\n]+\$/g, " [公式] ")
    .replace(/```[\s\S]*?```/g, " [代码] ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length <= maxLength) return stripped;
  return `${stripped.slice(0, maxLength)}...`;
}

export function toQuestionTitle(markdown: string, maxLength = 48): string {
  const plain = toPlainPreview(markdown, 300);
  if (!plain) return "未命名错题";
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength)}...`;
}
