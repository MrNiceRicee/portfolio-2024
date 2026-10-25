import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeComments } from "./comment-policy";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function isAuthoredCode(filename: string): boolean {
  if (!/\.(?:[cm]?[jt]sx?|astro|css|html)$/iu.test(filename)) return false;
  if (
    /(?:^|\/)(?:node_modules|dist|\.astro|\.git|\.wrangler|assets|fonts|third-party|third_party|vendor|generated)(?:\/|$)/iu.test(
      filename,
    )
  )
    return false;
  if (/\.(?:min|generated)\./iu.test(filename)) return false;
  return !filename.includes("/") || /^(?:scripts|tests|src|media|public)\//u.test(filename);
}

export function checkComments(repositoryRoot = root): number {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  const filenames = [...new Set(paths.split("\0").filter(isAuthoredCode))].sort();
  let failures = 0;
  for (const filename of filenames) {
    const source = readFileSync(resolve(repositoryRoot, filename), "utf8");
    if (/^\s*(?:\/\/|\/\*+!?|<!--)\s*[@#]generated\b/u.test(source)) continue;
    for (const diagnostic of analyzeComments(filename, source)) {
      console.error(`${filename}:${diagnostic.line}: ${diagnostic.message}`);
      failures += 1;
    }
  }
  if (failures === 0) console.log(`comment policy passed (${filenames.length} authored files)`);
  return failures === 0 ? 0 : 1;
}

if (import.meta.main) process.exitCode = checkComments();
