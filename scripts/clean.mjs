import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const distPath = path.join(root, "dist");

fs.rmSync(distPath, { recursive: true, force: true });
