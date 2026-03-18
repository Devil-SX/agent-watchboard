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

export type TerminalActivityAssessment = {
  sanitized: string;
  visibleCharacterCount: number;
  asciiCharacterCount: number;
  wordCharacterCount: number;
  suspiciousSquareCount: number;
  asciiRatio: number;
  suspiciousSquareRatio: number;
  isMeaningfulActivity: boolean;
  reason: "empty" | "too-many-squares" | "insufficient-readable-text" | "meaningful";
};

export function stripTerminalControlSequences(data: string): string {
  return data
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b[\(\)][A-Za-z0-9]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, "")
    .replace(/\r/g, "");
}

export function assessTerminalActivity(data: string): TerminalActivityAssessment {
  const sanitized = stripTerminalControlSequences(data);
  const visibleCharacters = Array.from(sanitized).filter((character) => !/\s/u.test(character));
  const visibleCharacterCount = visibleCharacters.length;

  if (visibleCharacterCount === 0) {
    return {
      sanitized,
      visibleCharacterCount,
      asciiCharacterCount: 0,
      wordCharacterCount: 0,
      suspiciousSquareCount: 0,
      asciiRatio: 0,
      suspiciousSquareRatio: 0,
      isMeaningfulActivity: false,
      reason: "empty"
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
      visibleCharacterCount,
      asciiCharacterCount,
      wordCharacterCount,
      suspiciousSquareCount,
      asciiRatio,
      suspiciousSquareRatio,
      isMeaningfulActivity: false,
      reason: "too-many-squares"
    };
  }

  const hasReadablePayload =
    asciiCharacterCount >= 3 ||
    wordCharacterCount >= 3 ||
    (visibleCharacterCount <= 4 && asciiCharacterCount >= 1) ||
    asciiRatio >= 0.35;
  if (!hasReadablePayload) {
    return {
      sanitized,
      visibleCharacterCount,
      asciiCharacterCount,
      wordCharacterCount,
      suspiciousSquareCount,
      asciiRatio,
      suspiciousSquareRatio,
      isMeaningfulActivity: false,
      reason: "insufficient-readable-text"
    };
  }

  return {
    sanitized,
    visibleCharacterCount,
    asciiCharacterCount,
    wordCharacterCount,
    suspiciousSquareCount,
    asciiRatio,
    suspiciousSquareRatio,
    isMeaningfulActivity: true,
    reason: "meaningful"
  };
}
