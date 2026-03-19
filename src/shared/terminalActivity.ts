const SUSPICIOUS_TERMINAL_SQUARE_CHARS = new Set([
  "\u25a1", // WHITE SQUARE
  "\u25a0", // BLACK SQUARE
  "\u25aa", // BLACK SMALL SQUARE
  "\u25ab", // WHITE SMALL SQUARE
  "\u25fb", // WHITE MEDIUM SQUARE
  "\u25fc", // BLACK MEDIUM SQUARE
  "\u25fd", // WHITE MEDIUM SMALL SQUARE
  "\u25fe", // BLACK MEDIUM SMALL SQUARE
  "\ufffd" // REPLACEMENT CHARACTER
]);

const BOX_DRAWING_CHARS = /[─│┌┐└┘├┤┬┴┼╭╮╰╯]/gu;
const PROMPT_ONLY_PATTERN = /^[>›_ ]+$/u;
const CODEX_CHROME_MARKERS = [
  "OpenAI Codex",
  "Use /skills to list available skills",
  "/model to change",
  "directory:",
  "Tip:",
  "% left"
] as const;
const PROMPT_REDRAW_LINE_PATTERNS = [
  PROMPT_ONLY_PATTERN,
  /^OpenAI Codex(?:\s+\(v[\w.-]+\))?$/u,
  /^[>›_ ]+OpenAI Codex(?:\s+\(v[\w.-]+\))?$/u,
  /^model:\s+.+$/u,
  /^directory:\s+.+$/u,
  /^Use \/skills to list available skills$/u,
  /^Tip:\s+.+$/u,
  /^gpt-[\w.-]+(?:\s+\w+)*\s+·\s+\d+% left\s+·\s+.+$/u
] as const;

export type TerminalActivityAssessment = {
  sanitized: string;
  normalized: string;
  visibleCharacterCount: number;
  asciiCharacterCount: number;
  wordCharacterCount: number;
  suspiciousSquareCount: number;
  uniqueTokenCount: number;
  asciiRatio: number;
  suspiciousSquareRatio: number;
  isMeaningfulActivity: boolean;
  reason: "empty" | "control-noise" | "too-many-squares" | "prompt-redraw-noise" | "short-low-signal" | "repeated-low-entropy"
  | "meaningful";
};

export function stripTerminalControlSequences(data: string): string {
  return data
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-9:;<=>?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[\(\)][A-Za-z0-9]/g, "")
    .replace(/\u001b[@-Z\\-_]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, "")
    .replace(/\r/g, "");
}

export function assessTerminalActivity(data: string): TerminalActivityAssessment {
  const sanitized = stripTerminalControlSequences(data);
  const normalized = normalizeTerminalActivityText(sanitized);
  const visibleCharacters = Array.from(sanitized).filter((character) => !/\s/u.test(character));
  const visibleCharacterCount = visibleCharacters.length;

  if (visibleCharacterCount === 0) {
    return {
      sanitized,
      normalized,
      visibleCharacterCount,
      asciiCharacterCount: 0,
      wordCharacterCount: 0,
      suspiciousSquareCount: 0,
      uniqueTokenCount: 0,
      asciiRatio: 0,
      suspiciousSquareRatio: 0,
      isMeaningfulActivity: false,
      reason: data.length > 0 ? "control-noise" : "empty"
    };
  }

  let asciiCharacterCount = 0;
  let wordCharacterCount = 0;
  let suspiciousSquareCount = 0;
  for (const character of visibleCharacters) {
    if (/[\x21-\x7e]/.test(character)) {
      asciiCharacterCount += 1;
    }
    if (/[\p{L}\p{N}]/u.test(character)) {
      wordCharacterCount += 1;
    }
    if (SUSPICIOUS_TERMINAL_SQUARE_CHARS.has(character)) {
      suspiciousSquareCount += 1;
    }
  }

  const asciiRatio = asciiCharacterCount / visibleCharacterCount;
  const suspiciousSquareRatio = suspiciousSquareCount / visibleCharacterCount;
  if (suspiciousSquareRatio >= 0.45) {
    return {
      sanitized,
      normalized,
      visibleCharacterCount,
      asciiCharacterCount,
      wordCharacterCount,
      suspiciousSquareCount,
      uniqueTokenCount: 0,
      asciiRatio,
      suspiciousSquareRatio,
      isMeaningfulActivity: false,
      reason: "too-many-squares"
    };
  }

  const tokens = tokenizeTerminalActivityText(normalized);
  const uniqueTokenCount = new Set(tokens).size;
  if (!normalized) {
    return {
      sanitized,
      normalized,
      visibleCharacterCount,
      asciiCharacterCount,
      wordCharacterCount,
      suspiciousSquareCount,
      uniqueTokenCount,
      asciiRatio,
      suspiciousSquareRatio,
      isMeaningfulActivity: false,
      reason: "control-noise"
    };
  }

  if (isPromptRedrawNoise(normalized)) {
    return {
      sanitized,
      normalized,
      visibleCharacterCount,
      asciiCharacterCount,
      wordCharacterCount,
      suspiciousSquareCount,
      uniqueTokenCount,
      asciiRatio,
      suspiciousSquareRatio,
      isMeaningfulActivity: false,
      reason: "prompt-redraw-noise"
    };
  }

  if (isShortLowSignalPayload(normalized, visibleCharacterCount, asciiCharacterCount, wordCharacterCount, tokens)) {
    return {
      sanitized,
      normalized,
      visibleCharacterCount,
      asciiCharacterCount,
      wordCharacterCount,
      suspiciousSquareCount,
      uniqueTokenCount,
      asciiRatio,
      suspiciousSquareRatio,
      isMeaningfulActivity: false,
      reason: "short-low-signal"
    };
  }

  if (isRepeatedLowEntropyPayload(normalized, tokens)) {
    return {
      sanitized,
      normalized,
      visibleCharacterCount,
      asciiCharacterCount,
      wordCharacterCount,
      suspiciousSquareCount,
      uniqueTokenCount,
      asciiRatio,
      suspiciousSquareRatio,
      isMeaningfulActivity: false,
      reason: "repeated-low-entropy"
    };
  }

  const hasReadablePayload =
    asciiCharacterCount >= 3 ||
    wordCharacterCount >= 3 ||
    asciiRatio >= 0.35;
  if (!hasReadablePayload) {
    return {
      sanitized,
      normalized,
      visibleCharacterCount,
      asciiCharacterCount,
      wordCharacterCount,
      suspiciousSquareCount,
      uniqueTokenCount,
      asciiRatio,
      suspiciousSquareRatio,
      isMeaningfulActivity: false,
      reason: "short-low-signal"
    };
  }

  return {
    sanitized,
    normalized,
    visibleCharacterCount,
    asciiCharacterCount,
    wordCharacterCount,
    suspiciousSquareCount,
    uniqueTokenCount,
    asciiRatio,
    suspiciousSquareRatio,
    isMeaningfulActivity: true,
    reason: "meaningful"
  };
}

function normalizeTerminalActivityText(value: string): string {
  return value
    .replace(BOX_DRAWING_CHARS, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function tokenizeTerminalActivityText(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}./:%_-]*/gu) ?? [];
}

function isPromptRedrawNoise(value: string): boolean {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return false;
  }
  if (lines.every((line) => PROMPT_REDRAW_LINE_PATTERNS.some((pattern) => pattern.test(line)))) {
    return true;
  }

  let markerMatches = 0;
  for (const marker of CODEX_CHROME_MARKERS) {
    if (value.includes(marker)) {
      markerMatches += 1;
    }
  }
  return markerMatches >= 2;
}

function isShortLowSignalPayload(
  normalized: string,
  visibleCharacterCount: number,
  asciiCharacterCount: number,
  wordCharacterCount: number,
  tokens: string[]
): boolean {
  return (
    normalized.length <= 6 ||
    visibleCharacterCount <= 6 ||
    (tokens.length <= 1 && wordCharacterCount <= 2 && asciiCharacterCount <= 8)
  );
}

function isRepeatedLowEntropyPayload(normalized: string, tokens: string[]): boolean {
  if (tokens.length >= 3 && new Set(tokens).size <= 1) {
    return true;
  }

  const compact = normalized.replace(/\s+/g, "");
  if (compact.length < 8) {
    return false;
  }

  const frequency = new Map<string, number>();
  let maxCount = 0;
  for (const character of Array.from(compact)) {
    const nextCount = (frequency.get(character) ?? 0) + 1;
    frequency.set(character, nextCount);
    if (nextCount > maxCount) {
      maxCount = nextCount;
    }
  }
  return maxCount / compact.length >= 0.7;
}
