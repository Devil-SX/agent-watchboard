export function stripJsonCommentsPreservePositions(content: string): string {
  let result = "";
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < content.length) {
    const current = content[index] ?? "";
    const next = content[index + 1] ?? "";

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === "\"") {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (current === "\"") {
      inString = true;
      result += current;
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      result += "  ";
      index += 2;
      while (index < content.length) {
        const char = content[index] ?? "";
        if (char === "\n" || char === "\r") {
          break;
        }
        result += " ";
        index += 1;
      }
      continue;
    }

    if (current === "/" && next === "*") {
      result += "  ";
      index += 2;
      while (index < content.length) {
        const char = content[index] ?? "";
        const following = content[index + 1] ?? "";
        if (char === "*" && following === "/") {
          result += "  ";
          index += 2;
          break;
        }
        result += char === "\n" || char === "\r" ? char : " ";
        index += 1;
      }
      continue;
    }

    result += current;
    index += 1;
  }

  return result;
}
