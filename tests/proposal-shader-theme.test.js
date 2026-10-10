import { expect, test } from "bun:test";

test("mounted paper follows theme changes without animating and releases its observer", () => {
  const child = Bun.spawnSync([process.execPath, "-e", `
    import { readFileSync } from "node:fs";
    import assert from "node:assert/strict";
    import { getPaperVariant, paperVariants } from "./src/scripts/proposalConfig";
    let dark = false, callback, disconnects = 0, disposals = 0, staticFrames = 0;
    const updates = [];
    const root = { dataset: { surface: "fibers" }, hasAttribute: () => false, classList: { contains: () => dark } };
    const document = Object.assign(new EventTarget(), { documentElement: root, querySelector: () => ({ replaceChildren() {} }) });
    const window = new EventTarget();
    Object.assign(globalThis, { document, window,
      MutationObserver: class { constructor(fn) { callback = fn; } observe(target, options) { assert.equal(target, root); assert.deepEqual(options.attributeFilter, ["class"]); } disconnect() { disconnects++; } },
      requestAnimationFrame: fn => { queueMicrotask(fn); return 1; },
    });
    let failUpdate = false;
    class ShaderMount {
      constructor(host, shader, uniforms, context, speed) {
        assert.equal(speed, 0);
        assert.equal(uniforms.u_colorPaper, "#f4f0e6");
        this.textures = new Map([["u_noiseTexture", {}]]);
        this.canvasElement = Object.assign(new EventTarget(), { setAttribute() {}, getContext: () => ({ CURRENT_PROGRAM: 1, NO_ERROR: 0, getParameter: () => ({}), getError: () => 0 }) });
      }
      setUniforms(value) { if (failUpdate) throw new Error("update failed"); updates.push(value); }
      setFrame(value) { assert.equal(value, 0); staticFrames++; }
      dispose() { disposals++; }
    }
    const source = new Bun.Transpiler({ loader: "ts" }).transformSync(readFileSync("src/scripts/proposalShaders.ts", "utf8"))
      .replace(/import[\\s\\S]*?from\\s*['"][^'"]+['"];?/g, "").replace(/export /g, "");
    const initialize = new Function("getPaperVariant", "paperVariants", "ShaderMount", "ShaderFitOptions", "getShaderColorFromString", "getShaderNoiseTexture", "paperTextureFragmentShader", source + "; return initializeProposalShaders;")
      (getPaperVariant, paperVariants, ShaderMount, { cover: 0 }, value => value, () => ({ decode: async () => {} }), "shader");
    const controller = new AbortController();
    await initialize(controller.signal);
    callback(); assert.equal(updates.length, 0);
    dark = true; callback();
    assert.deepEqual(updates[0], { u_colorBack: "#191713", u_colorPaper: "#191713", u_colorShadow: "#40382d" });
    callback(); assert.equal(updates.length, 1);
    dark = false; callback(); assert.equal(updates[1].u_colorPaper, "#f4f0e6");
    assert.equal(staticFrames, 1);
    window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }));
    assert.equal(disconnects, 0);
    controller.abort();
    assert.equal(disconnects, 1); assert.equal(disposals, 1);
    dark = true; callback(); assert.equal(updates.length, 2);
    dark = false;
    await initialize(new AbortController().signal);
    failUpdate = true; dark = true; callback();
    assert.equal(root.dataset.shaderStatus, "fallback");
    assert.equal(disconnects, 2); assert.equal(disposals, 2);
    console.log("PASS theme palette, no-op, static frame, BFCache, abort, failure fallback");
  `], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  expect(new TextDecoder().decode(child.stderr)).toBe("");
  expect(child.exitCode).toBe(0);
});
