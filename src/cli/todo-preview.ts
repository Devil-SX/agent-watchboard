import { Command } from "commander";

import {
  addItemToSection,
  ensureBoardDocument,
  moveItem,
  readBoardDocument,
  removeNode,
  renameSection,
  setItemDeadline,
  serializeBoardAsLines,
  updateItemStatus,
  updateNodeText,
  writeBoardDocument
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
  .option("--description <description>", "task description", "")
  .option("--ddl <date>", "deadline date in YYYY-MM-DD")
  .action(async (name, options) => {
    const filePath = program.opts().file;
    const document = await getDocument(filePath);
    addItemToSection(document, options.topic, name, options.description, options.ddl ?? null);
    await writeBoardDocument(filePath, document);
  });

program
  .command("done <name>")
  .description("Mark a task done")
  .action(async (name) => {
    const filePath = program.opts().file;
    const document = await getDocument(filePath);
    updateItemStatus(document, name, "done");
    await writeBoardDocument(filePath, document);
  });

program
  .command("update <from> <to>")
  .description("Rename a task or section")
  .option("--description <description>", "new description")
  .option("--ddl <date>", "deadline date in YYYY-MM-DD")
  .option("--clear-ddl", "remove the deadline from a task")
  .action(async (from, to, options) => {
    const filePath = program.opts().file;
    const document = await getDocument(filePath);
    const deadlineAt = options.clearDdl ? null : options.ddl;
    updateNodeText(document, from, to, options.description, deadlineAt);
    await writeBoardDocument(filePath, document);
  });

program
  .command("ddl <name> [date]")
  .description("Set or clear a task deadline")
  .option("--clear", "remove the deadline")
  .action(async (name, date, options) => {
    const filePath = program.opts().file;
    const document = await getDocument(filePath);
    setItemDeadline(document, name, options.clear ? null : (date ?? null));
    await writeBoardDocument(filePath, document);
  });

program
  .command("move <name> <topic>")
  .description("Move a task into another topic")
  .action(async (name, topic) => {
    const filePath = program.opts().file;
    const document = await getDocument(filePath);
    moveItem(document, name, topic);
    await writeBoardDocument(filePath, document);
  });

program
  .command("rename-topic <from> <to>")
  .description("Rename a section")
  .action(async (from, to) => {
    const filePath = program.opts().file;
    const document = await getDocument(filePath);
    renameSection(document, from, to);
    await writeBoardDocument(filePath, document);
  });

program
  .command("remove <name>")
  .description("Remove a task or section by name")
  .action(async (name) => {
    const filePath = program.opts().file;
    const document = await getDocument(filePath);
    removeNode(document, name);
    await writeBoardDocument(filePath, document);
  });

program
  .command("migrate-markdown <markdownPath>")
  .description("Import a simple markdown todo board into JSON")
  .action(async (markdownPath) => {
    const filePath = program.opts().file;
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(markdownPath, "utf8");
    const document = await getDocument(filePath);

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
    await writeBoardDocument(filePath, document);
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
