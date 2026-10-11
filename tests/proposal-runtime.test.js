import { expect, test } from "bun:test";

// each child isolates module mocks from the real particle/lifecycle test imports
function probe(mode) {
  const child = Bun.spawnSync([process.execPath, "-e", `
    import { mock } from "bun:test";
    import { readFileSync } from "node:fs";
    const mode = ${JSON.stringify(mode)};
    const calls = [];
    let imports = 0;
    mock.module(process.cwd() + "/src/scripts/proposalFilm.ts", () => ({
      initializeProposalFilm() { calls.push("film"); },
    }));
    mock.module(process.cwd() + "/src/scripts/proposalShaders.ts", () => ({
      async initializeProposalShaders() {
        calls.push("shader");
        if (mode === "shader-failure") throw new Error("shader rejected");
        document.documentElement.dataset.shaderStatus = "ready";
      },
    }));
    const document = new EventTarget();
    document.documentElement = { dataset: {}, hasAttribute: key => key === "data-proposal" ? mode !== "ordinary" : key === "data-fallback" && mode === "fallback" };
    globalThis.document = document;
    globalThis.window = new EventTarget();
    const events = [];
    document.addEventListener("proposalshaderchange", () => events.push("shader-change"));
    const component = readFileSync("src/components/ProposalSurface.astro", "utf8");
    const script = component.match(/<script>([\\s\\S]*?)<\\/script>/)[1];
    // execute the actual guard and rejection handling; substitute only module loading
    const executable = script.replace(/import\\(([^)]+)\\)/, "return loadRuntime($1)");
    await new Function("document", "loadRuntime", executable)(document, async () => {
      imports++;
      if (mode === "entry-failure") throw new Error("entry chunk rejected");
      return import("./src/scripts/proposalRuntime.ts");
    });
    console.log(JSON.stringify({ imports, calls, events, state: document.documentElement.dataset }));
  `], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  if (child.exitCode !== 0) throw new Error(new TextDecoder().decode(child.stderr));
  return JSON.parse(new TextDecoder().decode(child.stdout));
}

test("non-proposal page guard never imports or starts proposal runtime", () => {
  const result = probe("ordinary");
  expect(result.imports).toBe(0);
  expect(result.calls).toEqual([]);
  expect(result.events).toEqual([]);
  expect(result.state).toEqual({});
});
test("plain fallback preview never imports or starts the renderer runtime", () => {
  const result = probe("fallback");
  expect(result.imports).toBe(0);
  expect(result.calls).toEqual([]);
  expect(result.events).toEqual([]);
  expect(result.state).toEqual({});
});
test("shader rejection publishes fallback through the existing shader event", () => {
  const result = probe("shader-failure");
  expect(result.imports).toBe(1);
  expect(result.state.shaderStatus).toBe("fallback");
  expect(result.events).toEqual(["shader-change"]);
});
test("entry chunk rejection keeps paper static and publishes truthful film fallback", () => {
  const result = probe("entry-failure");
  expect(result.imports).toBe(1);
  expect(result.calls).toEqual([]);
  expect(result.state).toEqual({ shaderStatus: "fallback", filmMotion: "paused" });
  expect(result.events).toEqual(["shader-change"]);
});
