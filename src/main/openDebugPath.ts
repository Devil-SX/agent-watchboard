import { existsSync, lstatSync } from "node:fs";
import { dirname } from "node:path";

export function resolveDebugPathOpenTarget(debugPath: string): string {
  if (!existsSync(debugPath)) {
    throw new Error(`Debug path does not exist: ${debugPath}`);
  }

  return lstatSync(debugPath).isDirectory() ? debugPath : dirname(debugPath);
}

export async function openDebugPath(debugPath: string, openPath: (targetPath: string) => Promise<string>): Promise<void> {
  const targetPath = resolveDebugPathOpenTarget(debugPath);
  const errorMessage = await openPath(targetPath);
  if (errorMessage) {
    throw new Error(`Failed to open debug path: ${targetPath}. ${errorMessage}`);
  }
}
