import { expect, test } from "bun:test";

test("mounted paper follows theme changes without animating and releases its observer", () => {
  const child = Bun.spawnSync([process.execPath, "-e", `
    import { mock } from "bun:test";
    import assert from "node:assert/strict";
    let dark = false, callback, disconnects = 0, disposals = 0, staticFrames = 0;
    const updates = [];
    const root = { dataset: {}, hasAttribute: () => false, classList: { contains: () => dark } };
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
        assert.equal(uniforms.u_colorPaper, "#fafaf9");
        assert.deepEqual([uniforms.u_folds, uniforms.u_wrinkles, uniforms.u_crumples], [0, 0, 0]);
        this.textures = new Map([["u_noiseTexture", {}]]);
        this.canvasElement = Object.assign(new EventTarget(), { setAttribute() {}, getContext: () => ({ CURRENT_PROGRAM: 1, NO_ERROR: 0, getParameter: () => ({}), getError: () => 0 }) });
      }
      setUniforms(value) { if (failUpdate) throw new Error("update failed"); updates.push(value); }
      setFrame(value) { assert.equal(value, 0); staticFrames++; }
      dispose() { disposals++; }
    }
    mock.module("@paper-design/shaders", () => ({
      ShaderMount,
      ShaderFitOptions: { cover: 0 },
      getShaderColorFromString: value => value,
      getShaderNoiseTexture: () => ({ decode: async () => {} }),
      paperTextureFragmentShader: "shader",
    }));
    const { initializeProposalShaders } = await import("./src/scripts/proposalShaders.ts");
    const controller = new AbortController();
    await initializeProposalShaders(controller.signal);
    callback(); assert.equal(updates.length, 0);
    dark = true; callback();
    assert.deepEqual(updates[0], { u_colorBack: "#0c0a09", u_colorPaper: "#0c0a09", u_colorShadow: "#40382d" });
    callback(); assert.equal(updates.length, 1);
    dark = false; callback(); assert.equal(updates[1].u_colorPaper, "#fafaf9");
    assert.equal(staticFrames, 1);
    window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }));
    assert.equal(disconnects, 0);
    controller.abort();
    assert.equal(disconnects, 1); assert.equal(disposals, 1);
    dark = true; callback(); assert.equal(updates.length, 2);
    dark = false;
    await initializeProposalShaders(new AbortController().signal);
    failUpdate = true; dark = true; callback();
    assert.equal(root.dataset.shaderStatus, "fallback");
    assert.equal(disconnects, 2); assert.equal(disposals, 2);
    console.log("PASS theme palette, no-op, static frame, BFCache, abort, failure fallback");
  `], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  expect(new TextDecoder().decode(child.stderr)).toBe("");
  expect(child.exitCode).toBe(0);
});
