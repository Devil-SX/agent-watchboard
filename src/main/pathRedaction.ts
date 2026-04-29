const WINDOWS_USER_PATH_FRAGMENT = /[A-Za-z]:\\Users\\[^\\\r\n\t ]+/gi;
const WSL_UNC_HOME_FRAGMENT = /(\\\\wsl(?:\.localhost|\$)\\[^\\]+)\\home\\[^\\\r\n\t ]+/gi;
const POSIX_HOME_FRAGMENT = /(?<![A-Za-z0-9_])\/home\/[^/\r\n\t ]+/g;

export function sanitizePathForLogs(filePath: string): string {
  if (!filePath) {
    return filePath;
  }

  return filePath
    .replace(WSL_UNC_HOME_FRAGMENT, "$1\\~")
    .replace(WINDOWS_USER_PATH_FRAGMENT, "~")
    .replace(POSIX_HOME_FRAGMENT, "~");
}

export function sanitizePayloadPaths<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizePathForLogs(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePayloadPaths(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizePayloadPaths(entry)])
    ) as T;
  }

  return value;
}
