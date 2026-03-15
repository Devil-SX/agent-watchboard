let requestSequence = 0;

export function createRequestId(prefix = "req"): string {
  requestSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${requestSequence.toString(36)}`;
}
