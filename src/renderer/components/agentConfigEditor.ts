import { TomlError, parse as parseToml } from "smol-toml";

import type { AgentConfigFormat } from "@shared/schema";

type HighlightTokenKind =
  | "plain"
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punctuation"
  | "comment"
  | "section"
  | "date";

type HighlightToken = {
  kind: HighlightTokenKind;
  text: string;
};

export type AgentConfigValidation =
  | {
      status: "idle";
      format: AgentConfigFormat | null;
      summary: string;
      detail: string | null;
      line: null;
      column: null;
    }
  | {
      status: "valid";
      format: AgentConfigFormat;
      summary: string;
      detail: string | null;
      line: null;
      column: null;
    }
  | {
      status: "invalid";
      format: AgentConfigFormat;
      summary: string;
      detail: string | null;
      line: number | null;
      column: number | null;
    };

export function createIdleAgentConfigValidation(format: AgentConfigFormat | null, summary = "Loading config..."): AgentConfigValidation {
  return {
    status: "idle",
    format,
    summary,
    detail: null,
    line: null,
    column: null
  };
}

export function formatAgentConfigLabel(format: AgentConfigFormat): string {
  return format.toUpperCase();
}

export function validateAgentConfigContent(content: string, format: AgentConfigFormat): AgentConfigValidation {
  try {
    if (format === "json") {
      JSON.parse(content);
    } else {
      parseToml(content);
    }
    return {
      status: "valid",
      format,
      summary: `${formatAgentConfigLabel(format)} syntax is valid.`,
      detail: null,
      line: null,
      column: null
    };
  } catch (error) {
    if (format === "json") {
      return buildJsonValidationError(content, error);
    }
    return buildTomlValidationError(error);
  }
}

export function highlightAgentConfigContent(content: string, format: AgentConfigFormat | null): string {
  if (!content) {
    return "";
  }
  if (!format) {
    return escapeHtml(content);
  }
  const tokens = format === "json" ? tokenizeJson(content) : tokenizeToml(content);
  return tokens
    .map((token) => {
      if (token.kind === "plain") {
        return escapeHtml(token.text);
      }
      return `<span class="agent-config-token is-${token.kind}">${escapeHtml(token.text)}</span>`;
    })
    .join("");
}

function buildJsonValidationError(content: string, error: unknown): AgentConfigValidation {
  const message = error instanceof Error ? error.message : String(error);
  const explicitLocationMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  const positionMatch = message.match(/position\s+(\d+)/i);
  let line: number | null = explicitLocationMatch ? Number(explicitLocationMatch[1]) : null;
  let column: number | null = explicitLocationMatch ? Number(explicitLocationMatch[2]) : null;
  if ((line === null || column === null) && positionMatch) {
    const position = Number(positionMatch[1]);
    ({ line, column } = computeLineColumn(content, position));
  }

  return {
    status: "invalid",
    format: "json",
    summary: buildInvalidSummary("json", line, column),
    detail: message
      .replace(/\s+at position \d+(?:\s+\(line \d+ column \d+\))?\.?$/i, "")
      .trim(),
    line,
    column
  };
}

function buildTomlValidationError(error: unknown): AgentConfigValidation {
  if (error instanceof TomlError) {
    return {
      status: "invalid",
      format: "toml",
      summary: buildInvalidSummary("toml", error.line, error.column),
      detail: error.message.replace(/^Invalid TOML document:\s*/i, "").split("\n")[0]?.trim() ?? error.message,
      line: error.line,
      column: error.column
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "invalid",
    format: "toml",
    summary: buildInvalidSummary("toml", null, null),
    detail: message,
    line: null,
    column: null
  };
}

function buildInvalidSummary(format: AgentConfigFormat, line: number | null, column: number | null): string {
  const formatLabel = formatAgentConfigLabel(format);
  if (line === null || column === null) {
    return `${formatLabel} syntax is invalid.`;
  }
  return `${formatLabel} syntax is invalid at line ${line}, column ${column}.`;
}

function computeLineColumn(content: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let cursor = 0; cursor < content.length && cursor < index; cursor += 1) {
    if (content[cursor] === "\n") {
      line += 1;
      column = 1;
      continue;
    }
    column += 1;
  }
  return { line, column };
}

function tokenizeJson(content: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let index = 0;
  while (index < content.length) {
    const char = content[index] ?? "";
    if (char === "\"") {
      const endIndex = findQuotedStringEnd(content, index, "\"");
      const text = content.slice(index, endIndex);
      const nextToken = findNextNonWhitespace(content, endIndex);
      tokens.push({
        kind: nextToken === ":" ? "key" : "string",
        text
      });
      index = endIndex;
      continue;
    }
    if ("{}[]:,".includes(char)) {
      tokens.push({ kind: "punctuation", text: char });
      index += 1;
      continue;
    }
    if (char === "-" || isDigit(char)) {
      const match = content.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        tokens.push({ kind: "number", text: match[0] });
        index += match[0].length;
        continue;
      }
    }
    const literal = readLiteral(content, index);
    if (literal === "true" || literal === "false") {
      tokens.push({ kind: "boolean", text: literal });
      index += literal.length;
      continue;
    }
    if (literal === "null") {
      tokens.push({ kind: "null", text: literal });
      index += literal.length;
      continue;
    }
    const nextBoundary = findNextJsonBoundary(content, index + 1);
    tokens.push({ kind: "plain", text: content.slice(index, nextBoundary) });
    index = nextBoundary;
  }
  return tokens;
}

function tokenizeToml(content: string): HighlightToken[] {
  const lines = content.split("\n");
  const tokens: HighlightToken[] = [];
  lines.forEach((line, index) => {
    tokens.push(...tokenizeTomlLine(line));
    if (index < lines.length - 1) {
      tokens.push({ kind: "plain", text: "\n" });
    }
  });
  return tokens;
}

function tokenizeTomlLine(line: string): HighlightToken[] {
  if (!line) {
    return [];
  }
  const commentIndex = findTomlCommentStart(line);
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
  const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const tokens: HighlightToken[] = [];

  if (/^\s*\[\[?.+\]\]?\s*$/.test(code)) {
    const [, leadingWhitespace = "", section = "", trailingWhitespace = ""] = code.match(/^(\s*)(.*?)(\s*)$/) ?? [];
    if (leadingWhitespace) {
      tokens.push({ kind: "plain", text: leadingWhitespace });
    }
    if (section) {
      tokens.push({ kind: "section", text: section });
    }
    if (trailingWhitespace) {
      tokens.push({ kind: "plain", text: trailingWhitespace });
    }
  } else {
    const assignmentIndex = findTomlAssignmentIndex(code);
    if (assignmentIndex >= 0) {
      const left = code.slice(0, assignmentIndex);
      const right = code.slice(assignmentIndex + 1);
      const [, leadingWhitespace = "", key = "", trailingWhitespace = ""] = left.match(/^(\s*)(.*?)(\s*)$/) ?? [];
      if (leadingWhitespace) {
        tokens.push({ kind: "plain", text: leadingWhitespace });
      }
      if (key) {
        tokens.push({ kind: "key", text: key });
      }
      if (trailingWhitespace) {
        tokens.push({ kind: "plain", text: trailingWhitespace });
      }
      tokens.push({ kind: "punctuation", text: "=" });
      tokens.push(...tokenizeTomlValue(right));
    } else {
      tokens.push(...tokenizeTomlValue(code));
    }
  }

  if (comment) {
    tokens.push({ kind: "comment", text: comment });
  }
  return tokens;
}

function tokenizeTomlValue(content: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let index = 0;
  while (index < content.length) {
    const char = content[index] ?? "";
    if (char === "\"" || char === "'") {
      const endIndex = findQuotedStringEnd(content, index, char);
      tokens.push({ kind: "string", text: content.slice(index, endIndex) });
      index = endIndex;
      continue;
    }
    if ("[]{}=,".includes(char)) {
      tokens.push({ kind: "punctuation", text: char });
      index += 1;
      continue;
    }
    const literal = readLiteral(content, index);
    if (literal === "true" || literal === "false") {
      tokens.push({ kind: "boolean", text: literal });
      index += literal.length;
      continue;
    }
    const dateMatch = content
      .slice(index)
      .match(/^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?/);
    if (dateMatch) {
      tokens.push({ kind: "date", text: dateMatch[0] });
      index += dateMatch[0].length;
      continue;
    }
    const numberMatch = content
      .slice(index)
      .match(/^[+-]?(?:0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|(?:\d(?:_?\d)*)(?:\.(?:\d(?:_?\d)*)?)?(?:[eE][+-]?\d+)?)\b/);
    if (numberMatch) {
      tokens.push({ kind: "number", text: numberMatch[0] });
      index += numberMatch[0].length;
      continue;
    }
    const nextBoundary = findNextTomlBoundary(content, index + 1);
    tokens.push({ kind: "plain", text: content.slice(index, nextBoundary) });
    index = nextBoundary;
  }
  return tokens;
}

function findQuotedStringEnd(content: string, startIndex: number, quote: "\"" | "'"): number {
  let index = startIndex + 1;
  while (index < content.length) {
    const char = content[index] ?? "";
    if (quote === "\"" && char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
    index += 1;
  }
  return content.length;
}

function findNextNonWhitespace(content: string, startIndex: number): string | null {
  let index = startIndex;
  while (index < content.length) {
    const char = content[index] ?? "";
    if (!/\s/.test(char)) {
      return char;
    }
    index += 1;
  }
  return null;
}

function findNextJsonBoundary(content: string, startIndex: number): number {
  let index = startIndex;
  while (index < content.length) {
    if ("\"{}[]:,".includes(content[index] ?? "")) {
      break;
    }
    const literal = readLiteral(content, index);
    if (literal === "true" || literal === "false" || literal === "null") {
      break;
    }
    const char = content[index];
    if (char === "-" || isDigit(char ?? "")) {
      const match = content.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        break;
      }
    }
    index += 1;
  }
  return index;
}

function findNextTomlBoundary(content: string, startIndex: number): number {
  let index = startIndex;
  while (index < content.length) {
    const char = content[index];
    if ("\"'[]{}=,#".includes(char ?? "")) {
      break;
    }
    const literal = readLiteral(content, index);
    if (literal === "true" || literal === "false") {
      break;
    }
    const dateMatch = content
      .slice(index)
      .match(/^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?/);
    if (dateMatch) {
      break;
    }
    const numberMatch = content
      .slice(index)
      .match(/^[+-]?(?:0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|(?:\d(?:_?\d)*)(?:\.(?:\d(?:_?\d)*)?)?(?:[eE][+-]?\d+)?)\b/);
    if (numberMatch) {
      break;
    }
    index += 1;
  }
  return index;
}

function findTomlCommentStart(line: string): number {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previousChar = index > 0 ? line[index - 1] : "";
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === "\"" && !inSingleQuote && previousChar !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === "#" && !inSingleQuote && !inDoubleQuote) {
      return index;
    }
  }
  return -1;
}

function findTomlAssignmentIndex(line: string): number {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previousChar = index > 0 ? line[index - 1] : "";
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === "\"" && !inSingleQuote && previousChar !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === "=" && !inSingleQuote && !inDoubleQuote) {
      return index;
    }
  }
  return -1;
}

function readLiteral(content: string, startIndex: number): string {
  const match = content.slice(startIndex).match(/^[A-Za-z_][A-Za-z0-9_-]*/);
  return match?.[0] ?? "";
}

function isDigit(value: string): boolean {
  return value >= "0" && value <= "9";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
