import { readFileSync } from "node:fs";
import path from "node:path";

const IMPORT_PATTERN = /@import\s+["']([^"']+)["'];/g;

export function loadCssBundleText(entryUrl: URL): string {
  return loadCssFile(path.resolve(entryUrl.pathname), new Set<string>());
}

function loadCssFile(filePath: string, visited: Set<string>): string {
  if (visited.has(filePath)) {
    return "";
  }
  visited.add(filePath);

  const source = readFileSync(filePath, "utf8");
  const imports = [...source.matchAll(IMPORT_PATTERN)];
  const importedText = imports
    .map((match) => loadCssFile(path.resolve(path.dirname(filePath), match[1]), visited))
    .filter(Boolean)
    .join("\n");

  const localSource = source.replace(IMPORT_PATTERN, "").trim();
  return [importedText, localSource].filter(Boolean).join("\n");
}
