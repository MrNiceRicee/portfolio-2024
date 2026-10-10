import { expect, test } from "bun:test";

// Execute the actual component, runtime and shader bodies. Replace module delivery
// and vendor WebGL boundaries so imports, decode and the first frame can be held.
function probe(stage, rejected = false, persisted = false) {
  const child = Bun.spawnSync([process.execPath, "-e", `
    import { readFileSync } from "node:fs";
    import { initializeProposalParticles } from "./src/scripts/proposalParticles";
    import { initializeProposalFilm } from "./src/scripts/proposalFilm";
    import { getPaperVariant, paperVariants } from "./src/scripts/proposalConfig";
    const stage = ${JSON.stringify(stage)}, rejected = ${rejected}, persisted = ${persisted};
    let resolveHeld, rejectHeld;
    const held = new Promise((resolve, reject) => { resolveHeld = resolve; rejectHeld = reject; });
    const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
    const document = Object.assign(new EventTarget(), { hidden: false });
    const root = { dataset: { film: "original" }, hasAttribute: key => key === "data-proposal", classList: { contains: () => false } };
    document.documentElement = root;
    const window = Object.assign(new EventTarget(), { innerWidth: 390, innerHeight: 820 });
    const button = new EventTarget();
    let mounts = 0, disposals = 0, shaderFrames = 0, imports = 0;
    const host = { replaceChildren() {} };
    document.querySelector = selector => selector === "[data-proposal-particles]" ? { width: 0, height: 0, getContext: () => ({ clearRect() {}, fillRect() {} }) }
      : selector === "[data-pause-film]" ? button : host;
    const frames = new Map(); let next = 0;
    const intersections = [];
    Object.assign(globalThis, { document, window,
      matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
      MutationObserver: class { observe() {} disconnect() {} },
      IntersectionObserver: class { constructor(callback) { intersections.push(callback); } observe() {} disconnect() {} },
      requestAnimationFrame: callback => { frames.set(++next, callback); return next; },
      cancelAnimationFrame: id => frames.delete(id),
    });
    const events = [];
    document.addEventListener("proposalshaderchange", () => events.push(root.dataset.shaderStatus));
    const gl = { CURRENT_PROGRAM: 1, NO_ERROR: 0, getParameter: () => ({}), getError: () => 0 };
    class ShaderMount {
      constructor() { mounts++; this.textures = new Map([["u_noiseTexture", {}]]); this.canvasElement = Object.assign(new EventTarget(), { setAttribute() {}, getContext: () => gl }); }
      dispose() { disposals++; }
      setFrame() { shaderFrames++; }
    }
    const compile = path => new Bun.Transpiler({ loader: "ts" }).transformSync(readFileSync(path, "utf8"))
      .replace(/import[\\s\\S]*?from\\s*['"][^'"]+['"];?/g, "").replace(/export /g, "");
    const shaderBody = compile("src/scripts/proposalShaders.ts");
    const initializeProposalShaders = new Function("getPaperVariant", "paperVariants", "ShaderMount", "ShaderFitOptions", "getShaderColorFromString", "getShaderNoiseTexture", "paperTextureFragmentShader", shaderBody + "; return initializeProposalShaders;")
      (getPaperVariant, paperVariants, ShaderMount, { cover: 0 }, value => value, () => ({ decode: () => stage === "decode" ? held : Promise.resolve() }), "shader");
    const runtimeBody = compile("src/scripts/proposalRuntime.ts").replace(/import\\([^)]*\\)/, "loadShader()");
    const initializeProposalRuntime = new Function("initializeProposalParticles", "initializeProposalFilm", "loadShader", runtimeBody + "; return initializeProposalRuntime;")
      (initializeProposalParticles, initializeProposalFilm, async () => { imports++; if (stage === "shader") await held; return { initializeProposalShaders }; });
    const component = readFileSync("src/components/ProposalSurface.astro", "utf8").match(/<script>([\\s\\S]*?)<\\/script>/)[1];
    function loadRuntime() { return (async () => { if (stage === "entry") await held; return { initializeProposalRuntime }; })(); }
    globalThis.loadRuntime = loadRuntime;
    new Function(component.replace(/import\\([^)]*\\)/, "loadRuntime()"))();
    await flush();
    const hide = new Event("pagehide"); Object.defineProperty(hide, "persisted", { value: persisted });
    window.dispatchEvent(hide);
    const afterExit = { ...root.dataset };
    const eventsAfterExit = events.length;
    if (stage !== "frame") rejected ? rejectHeld(new Error("deferred failure")) : resolveHeld();
    await flush();
    // Release the real shader's first-frame readiness guard, if it was reached.
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(0); }
    await flush();
    if (persisted) {
      window.dispatchEvent(new Event("pageshow"));
      intersections.forEach(callback => callback([{ isIntersecting: true }]));
    }
    console.log(JSON.stringify({ mounts, disposals, shaderFrames, imports, frames: frames.size, afterExit,
      final: root.dataset, lateEvents: events.slice(eventsAfterExit), buttonHidden: button.hidden }));
  `], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  if (child.exitCode !== 0) throw new Error(new TextDecoder().decode(child.stderr));
  return JSON.parse(new TextDecoder().decode(child.stdout));
}


for (const stage of ["entry", "shader"]) {
  for (const rejected of [false, true]) {
    test(`${stage} import ${rejected ? "rejection" : "resolution"} after terminal pagehide does not initialize or publish`, () => {
      const result = probe(stage, rejected);
      expect(result.mounts).toBe(0);
      expect(result.frames).toBe(0);
      expect(result.final).toEqual(result.afterExit);
      expect(result.lateEvents).toEqual([]);
      if (stage === "entry") expect(result.imports).toBe(0);
    });
    test(`${stage} import ${rejected ? "rejection" : "resolution"} across persisted pagehide remains live`, () => {
      const result = probe(stage, rejected, true);
      expect(result.final.shaderStatus).toBe(rejected ? "fallback" : "ready");
      expect(result.final.filmMotion).toBe(rejected ? "paused" : "running");
      expect(result.frames).toBe(rejected ? 0 : 1);
      expect(result.mounts).toBe(rejected ? 0 : 1);
    });
  }
}
for (const stage of ["decode", "frame"]) {
  test(`terminal pagehide during shader ${stage} disposes resources and suppresses late readiness`, () => {
    const result = probe(stage);
    expect(result.final).toEqual(result.afterExit);
    expect(result.lateEvents).toEqual([]);
    expect(result.shaderFrames).toBe(0);
    expect(result.mounts).toBe(stage === "frame" ? 1 : 0);
    expect(result.disposals).toBe(result.mounts);
    expect(result.frames).toBe(0);
  });
  test(`persisted pagehide during shader ${stage} retains one resumable film loop`, () => {
    const result = probe(stage, false, true);
    expect(result.mounts).toBe(1);
    expect(result.disposals).toBe(0);
    expect(result.final.shaderStatus).toBe("ready");
    expect(result.final.filmMotion).toBe("running");
    expect(result.frames).toBe(1);
  });
}
test("decode rejection after terminal exit cannot publish fallback", () => {
  const result = probe("decode", true);
  expect(result.lateEvents).toEqual([]);
  expect(result.final).toEqual(result.afterExit);
  expect(result.mounts).toBe(0);
});
