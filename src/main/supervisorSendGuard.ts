import { type SupervisorCommand } from "@shared/schema";

type SupervisorSendClient = {
  send(command: SupervisorCommand): void;
};

type SupervisorSendLogger = {
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
};

type SupervisorSendContext = {
  channel: string;
  sessionId?: string;
  requestId?: string;
  details?: Record<string, unknown>;
};

function buildLogDetails(command: SupervisorCommand, context: SupervisorSendContext, error: unknown): Record<string, unknown> {
  return {
    channel: context.channel,
    commandType: command.type,
    sessionId: context.sessionId ?? ("sessionId" in command ? command.sessionId : undefined) ?? null,
    requestId: context.requestId ?? ("requestId" in command ? command.requestId ?? null : null),
    message: error instanceof Error ? error.message : String(error),
    ...(context.details ?? {})
  };
}

export function sendSupervisorCommandOrThrow(
  client: SupervisorSendClient,
  logger: SupervisorSendLogger,
  command: SupervisorCommand,
  context: SupervisorSendContext
): void {
  try {
    client.send(command);
  } catch (error) {
    logger.error("supervisor-send-failed", buildLogDetails(command, context, error));
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send supervisor command ${command.type}: ${message}`);
  }
}

export function sendSupervisorCommandSafely(
  client: SupervisorSendClient,
  logger: SupervisorSendLogger,
  command: SupervisorCommand,
  context: SupervisorSendContext
): void {
  try {
    client.send(command);
  } catch (error) {
    logger.warn("supervisor-send-failed", buildLogDetails(command, context, error));
  }
}
