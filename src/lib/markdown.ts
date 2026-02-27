export function normalizeMathDelimiters(input: string): string {
  if (!input) return "";
  let text = input.replace(/\r\n/g, "\n");

  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_full, inner: string) => `\n$$\n${inner.trim()}\n$$\n`);
  text = text.replace(/\\\(([^\n]+?)\\\)/g, (_full, inner: string) => `$${inner.trim()}$`);

  return text;
}

function mathToReadableText(math: string): string {
  return (math || "")
    .replace(/\\left|\\right/g, "")
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "$1/$2")
    .replace(/\\cdot/g, "*")
    .replace(/\\times/g, "*")
    .replace(/\\div/g, "/")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\^/g, "^")
    .replace(/_/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function stripChoiceSegment(text: string): string {
  return text
    .replace(/\s+([A-H])[\.、．]\s*/g, " | $1. ")
    .replace(/\s*选项\s*[：:]\s*/g, " 选项：")
    .replace(/\s*\|\s*([A-H])\.\s*/g, " $1. ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatQuestionLayout(markdown: string): string {
  const normalized = normalizeMathDelimiters(markdown || "");
  return normalized
    .replace(/\s*选项\s*[：:]\s*/g, "\n\n选项：\n")
    .replace(/\s([A-H])[\.、．]\s*/g, "\n$1. ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toPlainPreview(markdown: string, maxLength = 120): string {
  const normalized = normalizeMathDelimiters(markdown || "");

  const stripped = normalized
    .replace(/\$\$([\s\S]*?)\$\$/g, (_full, inner: string) => ` ${mathToReadableText(inner)} `)
    .replace(/\$([^$\n]+)\$/g, (_full, inner: string) => ` ${mathToReadableText(inner)} `)
    .replace(/```[\s\S]*?```/g, " [代码] ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/[*_~]/g, "")
    .replace(/\[(?:公式|数学|题目)\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const compact = stripChoiceSegment(stripped);
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength)}...`;
}

export function toQuestionTitle(markdown: string, maxLength = 48): string {
  const plain = toPlainPreview(markdown, 300);
  if (!plain) return "未命名错题";
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength)}...`;
}

export function extractQuestionType(solutionMarkdown?: string | null): string {
  const solution = normalizeMathDelimiters(solutionMarkdown || "");
  const lines = solution
    .split(/\n+/)
    .map((line) => line.replace(/^[-*#>\s]+/, "").trim())
    .filter(Boolean);

  const summaryLine = lines.find((line) => /^(题型总结|题型|知识点|本题类型)\s*[：:]/i.test(line));
  if (!summaryLine) return "";

  let value = summaryLine
    .replace(/^(题型总结|题型|知识点|本题类型)\s*[：:]\s*/i, "")
    .trim();

  const stopMatch = value.match(/^(.*?)(?:\s+(?:题目|已知|设|若|求|对于|给定)\b|[。！？]|$)/);
  if (stopMatch?.[1]) {
    value = stopMatch[1].trim();
  }

  return value;
}

export function extractReviewSummary(questionMarkdown: string, solutionMarkdown?: string | null, maxLength = 48): string {
  const questionType = extractQuestionType(solutionMarkdown);
  if (questionType) {
    if (questionType.length <= maxLength) return questionType;
    return `${questionType.slice(0, maxLength)}...`;
  }

  return toQuestionTitle(questionMarkdown, maxLength);
}
