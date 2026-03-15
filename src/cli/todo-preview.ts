import { Command } from "commander";

import {
  addItemToSection,
  applyBoardOperation,
  ensureBoardDocument,
  moveItem,
  readBoardDocument,
  removeNode,
  renameSection,
  setItemDeadline,
  serializeBoardAsLines,
  updateBoardDocument,
  updateItemStatus,
  updateNodeText,
} from "@shared/board";
import { resolveNodeRuntimePaths } from "@shared/runtimePaths";

const runtimePaths = resolveNodeRuntimePaths();

const program = new Command();

program
  .name("todo_preview")
  .description("Manage the Agent Watchboard JSON todo board.")
  .option("--file <path>", "board json path", runtimePaths.defaultHostBoardPath);

program
  .command("list")
  .description("Render the board as a readable list")
  .action(async () => {
    const document = await getDocument(program.opts().file);
    process.stdout.write(`${serializeBoardAsLines(document).join("\n")}\n`);
  });

program
  .command("add <name>")
  .description("Add a task under a topic")
  .option("--topic <topic>", "section name", "Inbox")
  .option("--history <history>", "completed work / evidence markdown", "")
  .option("--next <next>", "next step markdown", "")
  .option("--ddl <date>", "deadline date in YYYY-MM-DD")
  .action(async (name, options) => {
    const filePath = program.opts().file;
    await updateBoardDocument(filePath, (document) => {
      addItemToSection(document, options.topic, name, options.history, options.next, options.ddl ?? null);
    });
  });

program
  .command("done <name>")
  .description("Mark a task done")
  .action(async (name) => {
    const filePath = program.opts().file;
    await updateBoardDocument(filePath, (document) => {
      updateItemStatus(document, name, "done");
    });
  });

program
  .command("doing <name>")
  .description("Mark a task doing")
  .action(async (name) => {
    const filePath = program.opts().file;
    await updateBoardDocument(filePath, (document) => {
      updateItemStatus(document, name, "doing");
    });
  });

program
  .command("todo <name>")
  .description("Mark a task todo")
  .action(async (name) => {
    const filePath = program.opts().file;
    await updateBoardDocument(filePath, (document) => {
      updateItemStatus(document, name, "todo");
    });
  });

program
  .command("update <from> <to>")
  .description("Rename a task or section")
  .option("--history <history>", "updated completed work / evidence markdown")
  .option("--next <next>", "updated next step markdown")
  .option("--ddl <date>", "deadline date in YYYY-MM-DD")
  .option("--clear-ddl", "remove the deadline from a task")
  .action(async (from, to, options) => {
    const filePath = program.opts().file;
    await updateBoardDocument(filePath, (document) => {
      const deadlineAt = options.clearDdl ? null : options.ddl;
      updateNodeText(document, from, to, options.history, options.next, deadlineAt);
    });
  });

program
  .command("ddl <name> [date]")
  .description("Set or clear a task deadline")
  .option("--clear", "remove the deadline")
  .action(async (name, date, options) => {
    const filePath = program.opts().file;
    await updateBoardDocument(filePath, (document) => {
      setItemDeadline(document, name, options.clear ? null : (date ?? null));
    });
  });

program
  .command("move <name> <topic>")
  .description("Move a task into another topic")
  .action(async (name, topic) => {
    const filePath = program.opts().file;
    await updateBoardDocument(filePath, (document) => {
      moveItem(document, name, topic);
    });
  });

program
  .command("rename-topic <from> <to>")
  .description("Rename a section")
  .action(async (from, to) => {
    const filePath = program.opts().file;
    await updateBoardDocument(filePath, (document) => {
      renameSection(document, from, to);
    });
  });

program
  .command("remove <name>")
  .description("Remove a task or section by name")
  .action(async (name) => {
    const filePath = program.opts().file;
    await updateBoardDocument(filePath, (document) => {
      removeNode(document, name);
    });
  });

program
  .command("batch <operationsPath>")
  .description("Apply a list of board mutations atomically from a JSON file")
  .action(async (operationsPath) => {
    const filePath = program.opts().file;
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(operationsPath, "utf8");
    const operations = parseBatchOperations(JSON.parse(raw));
    await updateBoardDocument(filePath, (document) => {
      for (const operation of operations) {
        applyBoardOperation(document, operation);
      }
    });
  });

program
  .command("migrate-markdown <markdownPath>")
  .description("Import a simple markdown todo board into JSON")
  .action(async (markdownPath) => {
    const filePath = program.opts().file;
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(markdownPath, "utf8");

    await updateBoardDocument(filePath, (document) => {
      let currentSection = "Inbox";
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("# ")) {
          currentSection = line.slice(2).trim();
          continue;
        }
        const match = line.match(/^- \[( |x)\] (.+)$/);
        if (!match) {
          continue;
        }
        const itemName = match[2]?.trim();
        if (!itemName) {
          continue;
        }
        addItemToSection(document, currentSection, itemName);
        if (match[1] === "x") {
          updateItemStatus(document, itemName, "done");
        }
      }
    });
  });

program.action(async () => {
  const document = await getDocument(program.opts().file);
  process.stdout.write(`${serializeBoardAsLines(document).join("\n")}\n`);
});

void program.parseAsync(process.argv);

async function getDocument(filePath: string) {
  try {
    return await readBoardDocument(filePath);
  } catch {
    return ensureBoardDocument(filePath);
  }
}

function parseBatchOperations(raw: unknown[]) {
  if (!Array.isArray(raw)) {
    throw new Error("Batch operations file must be a JSON array");
  }
  return raw.map((entry, index) => parseBatchOperation(entry, index));
}

function parseBatchOperation(raw: unknown, index: number) {
  const candidate = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const op = typeof candidate.op === "string" ? candidate.op : "";
  switch (op) {
    case "add":
      return {
        op,
        topic: requiredString(candidate.topic, index, "topic"),
        name: requiredString(candidate.name, index, "name"),
        history: optionalString(candidate.history) ?? optionalString(candidate.description),
        next: optionalString(candidate.next),
        ddl: optionalNullableString(candidate.ddl)
      } as const;
    case "done":
    case "doing":
    case "todo":
    case "remove":
      return {
        op,
        name: requiredString(candidate.name, index, "name")
      } as const;
    case "update":
      return {
        op,
        from: requiredString(candidate.from, index, "from"),
        to: requiredString(candidate.to, index, "to"),
        history: optionalString(candidate.history) ?? optionalString(candidate.description),
        next: optionalString(candidate.next),
        ddl: optionalNullableString(candidate.ddl),
        clearDdl: Boolean(candidate.clearDdl)
      } as const;
    case "ddl":
      return {
        op,
        name: requiredString(candidate.name, index, "name"),
        date: optionalNullableString(candidate.date),
        clear: Boolean(candidate.clear)
      } as const;
    case "move":
      return {
        op,
        name: requiredString(candidate.name, index, "name"),
        topic: requiredString(candidate.topic, index, "topic")
      } as const;
    case "rename-topic":
      return {
        op,
        from: requiredString(candidate.from, index, "from"),
        to: requiredString(candidate.to, index, "to")
      } as const;
    default:
      throw new Error(`Unsupported batch operation at index ${index}: ${JSON.stringify(candidate)}`);
  }
}

function requiredString(value: unknown, index: number, key: string): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  throw new Error(`Invalid batch operation at index ${index}: missing ${key}`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}
