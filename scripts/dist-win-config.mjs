export function getWindowsDirBuildArgs(hostPlatform = process.platform) {
  const args = ["exec", "electron-builder", "--win", "dir"];

  if (hostPlatform !== "win32") {
    // WSL/Linux cross-host packaging must reuse node-pty's bundled Windows binaries.
    // electron-builder/@electron-rebuild does not detect node-pty's custom prebuild layout,
    // falls back to node-gyp, and then fails to cross-compile. Disabling EXE resource edits
    // also avoids a hard wine dependency for the unpacked win-unpacked test bundle.
    args.push("-c.npmRebuild=false", "-c.win.signAndEditExecutable=false");
  }

  return args;
}

export function isCrossPackagingHost(hostPlatform = process.platform) {
  return hostPlatform !== "win32";
}
