export function runBunProbe(source) {
  const child = Bun.spawnSync([process.execPath, "-e", source], {
    cwd: process.cwd(), stdout: "pipe", stderr: "pipe",
  });
  const decoder = new TextDecoder();
  const stderr = decoder.decode(child.stderr);
  if (child.exitCode !== 0) throw new Error(stderr);
  return { stdout: decoder.decode(child.stdout), stderr };
}
