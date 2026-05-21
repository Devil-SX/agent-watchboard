import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, parse } from "node:path";
import { tmpdir } from "node:os";

import { getWindowsDirBuildArgs, isCrossPackagingHost } from "./dist-win-config.mjs";

const root = process.cwd();
const executablePath = join(root, "release", "win-unpacked", "Agent Watchboard.exe");
const appAsarPath = join(root, "release", "win-unpacked", "resources", "app.asar");
const electronBuilderBin = join(root, "node_modules", ".bin", process.platform === "win32" ? "electron-builder.cmd" : "electron-builder");
const buildStartedAt = Date.now();
const stagedRuntimePackages = ["electron-log", "chokidar", "readdirp", "zod", "smol-toml", "ws", "node-pty", "node-addon-api"];

runOrThrow("pnpm", ["build"]);
removeStaleWindowsOutput();

const crossPackagingHost = isCrossPackagingHost();

if (crossPackagingHost) {
  process.stderr.write(
    "[watchboard] cross-host Windows packaging enabled: using staged app directory and skipping native dependency rebuild/executable edits\n"
  );
}

const builder = crossPackagingHost ? runStagedCrossHostBuilder() : runHostBuilder();

if ((builder.status ?? 1) === 0) {
  process.exit(0);
}

if (hasFreshWindowsOutput()) {
  process.stderr.write(
    `[watchboard] electron-builder reported a Windows packaging warning on this host, but the unpacked executable exists at ${executablePath}\n`
  );
  process.exit(0);
}

process.exit(builder.status ?? 1);

function runOrThrow(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runHostBuilder() {
  return spawnSync("pnpm", getWindowsDirBuildArgs(), {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
}

function runStagedCrossHostBuilder() {
  const stageDir = mkdtempSync(join(tmpdir(), "agent-watchboard-win-stage-"));
  try {
    cpSync(join(root, "out"), join(stageDir, "out"), { recursive: true });
    cpSync(join(root, "dist-node"), join(stageDir, "dist-node"), { recursive: true });
    writeStagedPackageJson(stageDir);
    copyStagedRuntimeNodeModules(stageDir);

    return spawnSync(
      electronBuilderBin,
      [
        "--win",
        "dir",
        `-c.directories.output=${join(root, "release")}`,
        "-c.npmRebuild=false",
        "-c.win.signAndEditExecutable=false"
      ],
      {
        cwd: stageDir,
        stdio: "inherit"
      }
    );
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

function writeStagedPackageJson(stageDir) {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  packageJson.packageManager = "traversal@0.0.0";
  packageJson.dependencies = Object.fromEntries(
    stagedRuntimePackages.map((packageName) => [packageName, getInstalledPackageVersion(packageName)])
  );
  packageJson.devDependencies = {};
  packageJson.build = {
    ...packageJson.build,
    electronVersion: getInstalledPackageVersion("electron"),
    files: Array.from(new Set([...(packageJson.build?.files ?? []), "node_modules/**/*"]))
  };
  writeFileSync(join(stageDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
}

function copyStagedRuntimeNodeModules(stageDir) {
  const stagedNodeModules = join(stageDir, "node_modules");
  for (const packageName of stagedRuntimePackages) {
    const packageRoot = findPackageRoot(packageName);
    cpSync(packageRoot, join(stagedNodeModules, packageName), {
      recursive: true,
      dereference: true,
      force: true
    });
  }
}

function findPackageRoot(packageName) {
  const searchRoots = [
    root,
    realpathSync(join(root, "node_modules", "chokidar")),
    realpathSync(join(root, "node_modules", "node-pty"))
  ];

  for (const searchRoot of searchRoots) {
    try {
      const requireFromPackage = createRequire(join(searchRoot, "package.json"));
      const resolvedPath = requireFromPackage.resolve(packageName);
      return findNearestPackageJson(dirname(resolvedPath));
    } catch {
      // Continue through package-local resolution roots for pnpm's isolated dependency layout.
    }
  }

  throw new Error(`Unable to resolve runtime package for staged Windows build: ${packageName}`);
}

function getInstalledPackageVersion(packageName) {
  const packageJsonPath = join(findPackageRoot(packageName), "package.json");
  return JSON.parse(readFileSync(packageJsonPath, "utf8")).version;
}

function findNearestPackageJson(startDir) {
  let currentDir = startDir;
  const rootDir = parse(currentDir).root;

  while (currentDir !== rootDir) {
    if (existsSync(join(currentDir, "package.json"))) {
      return currentDir;
    }
    currentDir = dirname(currentDir);
  }

  throw new Error(`Unable to find package.json for ${startDir}`);
}

function removeStaleWindowsOutput() {
  rmSync(join(root, "release", "win-unpacked"), { recursive: true, force: true });
}

function hasFreshWindowsOutput() {
  if (!existsSync(executablePath) || !existsSync(appAsarPath)) {
    return false;
  }

  return statSync(executablePath).mtimeMs >= buildStartedAt && statSync(appAsarPath).mtimeMs >= buildStartedAt;
}
