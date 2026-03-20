const WINDOWS_USER_PATH_PREFIX = /^([A-Za-z]:\\Users\\)[^\\]+/i;
const WSL_UNC_HOME_PREFIX = /^(\\\\wsl(?:\.localhost|\$)\\[^\\]+)\\home\\[^\\]+/i;
const POSIX_HOME_PREFIX = /^\/home\/[^/]+/i;

export function sanitizePathForLogs(filePath: string): string {
  if (!filePath) {
    return filePath;
  }

  const normalizedWslUnc = filePath.replace(WSL_UNC_HOME_PREFIX, "$1\\~");
  if (normalizedWslUnc !== filePath) {
    return normalizedWslUnc;
  }

  const normalizedWindowsUser = filePath.replace(WINDOWS_USER_PATH_PREFIX, "~");
  if (normalizedWindowsUser !== filePath) {
    return normalizedWindowsUser;
  }

  const normalizedPosixHome = filePath.replace(POSIX_HOME_PREFIX, "~");
  if (normalizedPosixHome !== filePath) {
    return normalizedPosixHome;
  }

  return filePath;
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
