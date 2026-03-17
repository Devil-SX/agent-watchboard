export type SkillFrontmatter = {
  name?: string;
  description?: string;
};

export function parseSkillFrontmatter(content: string): SkillFrontmatter {
  const normalized = content.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) {
    return {};
  }

  const lines = normalized.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return {};
  }

  const metadata: SkillFrontmatter = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (line === "---") {
      return metadata;
    }
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = normalizeFrontmatterValue(line.slice(separator + 1).trim());
    if (!value) {
      continue;
    }
    if (key === "name") {
      metadata.name = value;
    } else if (key === "description") {
      metadata.description = value;
    }
  }

  return metadata;
}

function normalizeFrontmatterValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
