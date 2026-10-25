import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkComments } from "./check";

describe("CLI worktree file discovery", () => {
  let directory;
  let error;
  let log;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "portfolio-comments-worktree-"));
    execFileSync("git", ["init", "--quiet", directory]);
    mkdirSync(join(directory, "src"));
    writeFileSync(join(directory, "src", "original.ts"), "export const value = 1;\n");
    execFileSync("git", ["add", "src/original.ts"], { cwd: directory });
    error = spyOn(console, "error").mockImplementation(() => {});
    log = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    error.mockRestore();
    log.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  });

  test("skips unstaged deletions and counts only existing source files", () => {
    rmSync(join(directory, "src", "original.ts"));
    writeFileSync(join(directory, "src", "remaining.ts"), "export const value = 2;\n");

    expect(checkComments(directory)).toBe(0);
    expect(error).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("comment policy passed (1 authored files)");
  });

  test("checks the untracked destination of an unstaged rename", () => {
    renameSync(join(directory, "src", "original.ts"), join(directory, "src", "renamed.ts"));
    writeFileSync(join(directory, "src", "renamed.ts"), "// one\n// two\n// three\n// four\n");

    expect(checkComments(directory)).toBe(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain("src/renamed.ts:1:");
    expect(log).not.toHaveBeenCalled();

    writeFileSync(join(directory, "src", "renamed.ts"), "export const value = 2;\n");
    expect(checkComments(directory)).toBe(0);
    expect(log).toHaveBeenCalledWith("comment policy passed (1 authored files)");
  });

  test("preserves source read failures other than missing paths", () => {
    rmSync(join(directory, "src", "original.ts"));
    mkdirSync(join(directory, "src", "original.ts"));

    expect(() => checkComments(directory)).toThrow(/EISDIR/u);
    expect(log).not.toHaveBeenCalled();
  });
});
