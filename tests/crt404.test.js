import { afterEach, expect, test } from "bun:test";
import { initializeCrt404 } from "../src/scripts/crt404";
import { POWER_OFF_MS, POWER_ON_MS } from "../src/scripts/crtPower";

let cleanup;
afterEach(() => { cleanup?.(); cleanup = undefined; });

// Browser rendering is checked separately; these doubles exercise the real controller/listeners.
function fixture({ reduced = false, forced = false, pendingFonts = false } = {}) {
  class Element extends EventTarget {
    dataset = {};
    attributes = new Map();
    hidden = true;
    disabled = false;
    textContent = "404";
    setAttribute(name, value) { this.attributes.set(name, value); }
    getBoundingClientRect() { return { top: 0, left: 0, bottom: 100, width: 200, height: 100 }; }
    querySelectorAll() { return []; }
  }
  const root = new Element();
  const canvas = new Element();
  const heading = new Element();
  const home = new Element();
  home.href = "https://portfolio.test/";
  const controls = new Element();
  const power = new Element();
  const label = new Element();
  const replay = new Element();
  root.dataset.crtRenderer = "static";
  const elements = { "[data-crt-canvas]": canvas, h1: heading, "[data-crt-home]": home,
    "[data-crt-controls]": controls, "[data-crt-power-button]": power, "[data-crt-replay]": replay };
  root.querySelector = selector => elements[selector];
  power.querySelector = () => label;
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  const colors = Object.assign(new EventTarget(), { matches: forced });
  const document = Object.assign(new EventTarget(), { hidden: false, querySelector: () => root });
  let resolveFonts;
  document.fonts = { ready: pendingFonts ? new Promise(resolve => { resolveFonts = resolve; }) : Promise.resolve() };
  document.createElement = () => ({ getContext: () => ({
    scale() {}, createRadialGradient: () => ({ addColorStop() {} }), fillRect() {},
  }) });
  const destinations = [];
  const window = Object.assign(new EventTarget(), {
    location: { assign: destination => destinations.push(destination) },
    setTimeout,
  });
  let now = 0;
  let nextFrame = 0;
  const frames = new Map();
  const originals = new Map();
  const globals = {
    document, window, devicePixelRatio: 1,
    performance: { now: () => now },
    matchMedia: query => query.includes("forced-colors") ? colors : motion,
    requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const renders = [];
  let creations = 0;
  let disposals = 0;
  const renderer = {
    maxTextureSize: 4096,
    upload() {},
    render(time, light, signal) { renders.push({ time, light: { ...light }, signal }); },
    dispose() { disposals++; },
  };
  const emit = (target, type, properties = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    target.dispatchEvent(event);
    return event;
  };
  cleanup = () => {
    emit(window, "pagehide", { persisted: false });
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
  return {
    root, canvas, home, power, replay, controls, motion, colors, document, window, frames, renders, destinations,
    initialize: () => initializeCrt404(() => { creations++; return renderer; }),
    creations: () => creations, disposals: () => disposals,
    resolveFonts: () => resolveFonts?.(), emit,
    click: (target, properties = {}) => emit(target, "click", { detail: 1, button: 0, ...properties }),
    preference(target, matches) { target.matches = matches; emit(target, "change"); },
    advance(milliseconds) {
      now += milliseconds;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(now);
    },
    visible(hidden) { document.hidden = hidden; emit(document, "visibilitychange"); },
  };
}

for (const preference of ["reduced", "forced"]) {
  test(`${preference} preference starts without a renderer or animation loop`, async () => {
    const f = fixture({ [preference]: true });
    await f.initialize();
    expect(f.creations()).toBe(0);
    expect(f.frames.size).toBe(0);
    expect(f.controls.hidden).toBe(true);
    expect(f.click(f.home).defaultPrevented).toBe(false);
  });

  test(`${preference} preference invalidates a renderer boot waiting for fonts`, async () => {
    const f = fixture({ pendingFonts: true });
    const boot = f.initialize();
    f.preference(preference === "reduced" ? f.motion : f.colors, true);
    f.resolveFonts();
    await boot;
    expect(f.creations()).toBe(0);
    expect(f.frames.size).toBe(0);
    expect(f.root.dataset.crtRenderer).toBe("static");
  });
}

for (const completion of ["shutdown", "context loss", "hidden", "already hidden", "already off"]) {
  test(`pointer Home navigates exactly once through ${completion}`, async () => {
    const f = fixture();
    await f.initialize();
    f.advance(POWER_ON_MS);
    if (completion === "already hidden") f.visible(true);
    if (completion === "already off") { f.click(f.power); f.advance(POWER_OFF_MS); }
    expect(f.click(f.home).defaultPrevented).toBe(true);
    if (completion !== "already hidden" && completion !== "already off") {
      expect(f.destinations).toEqual([]);
      f.click(f.home); // duplicate activation cannot replace or duplicate the pending navigation
    }
    if (completion === "shutdown") f.advance(POWER_OFF_MS);
    if (completion === "context loss") {
      expect(f.emit(f.canvas, "webglcontextlost").defaultPrevented).toBe(true);
      expect(f.disposals()).toBe(1);
    }
    if (completion === "hidden") f.visible(true);
    f.visible(true);
    f.advance(POWER_OFF_MS * 2);
    expect(f.destinations).toEqual([f.home.href]);
    expect(f.frames.size).toBe(0);
  });
}

test("keyboard, modified clicks and auxiliary buttons keep native Home behavior", async () => {
  const f = fixture();
  await f.initialize();
  for (const properties of [{ detail: 0 }, { metaKey: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }, { button: 1 }, { button: 2 }]) {
    expect(f.click(f.home, properties).defaultPrevented).toBe(false);
  }
  expect(f.destinations).toEqual([]);
  expect(f.power.disabled).toBe(false);
  expect(f.root.dataset.crtPower).toBe("starting");
});

test("BFCache suspends without destroying the renderer and resumes one loop", async () => {
  const f = fixture();
  await f.initialize();
  f.emit(f.window, "pagehide", { persisted: true });
  const renderCount = f.renders.length;
  f.advance(POWER_ON_MS * 2);
  expect(f.renders.length).toBe(renderCount);
  expect(f.frames.size).toBe(0);
  expect(f.disposals()).toBe(0);
  f.emit(f.window, "pageshow", { persisted: true });
  f.emit(f.window, "pageshow", { persisted: true });
  expect(f.creations()).toBe(1);
  expect(f.frames.size).toBe(1);
  f.advance(16);
  expect(f.renders.length).toBeGreaterThan(renderCount);
  expect(f.frames.size).toBe(1);
});

test("ordinary pagehide disposes once, stops work and removes activation listeners", async () => {
  const f = fixture();
  await f.initialize();
  f.emit(f.window, "pagehide", { persisted: false });
  const renderCount = f.renders.length;
  f.emit(f.window, "pagehide", { persisted: false });
  f.emit(f.window, "pageshow");
  f.click(f.power);
  expect(f.click(f.home).defaultPrevented).toBe(false);
  f.advance(POWER_OFF_MS);
  expect(f.disposals()).toBe(1);
  expect(f.creations()).toBe(1);
  expect(f.renders.length).toBe(renderCount);
  expect(f.frames.size).toBe(0);
});

test("power reversals stay continuous and bounded; Replay completes one off/on cycle", async () => {
  const f = fixture();
  await f.initialize();
  f.advance(POWER_ON_MS);
  for (let index = 0; index < 12; index++) {
    const before = f.renders.at(-1).light;
    f.click(f.power);
    f.advance(0);
    expect(f.renders.at(-1).light).toEqual(before);
    f.advance(35);
    expect(f.frames.size).toBe(1);
  }
  f.advance(POWER_ON_MS);
  expect(f.root.dataset.crtPower).toBe("on");
  f.click(f.replay);
  expect(f.replay.disabled).toBe(true);
  f.advance(POWER_OFF_MS);
  expect(f.root.dataset.crtPower).toBe("starting");
  expect(f.frames.size).toBe(1);
  f.advance(POWER_ON_MS);
  expect(f.root.dataset.crtPower).toBe("on");
  expect(f.replay.disabled).toBe(false);
  f.click(f.power);
  f.advance(POWER_OFF_MS);
  expect(f.root.dataset.crtPower).toBe("off");
  expect(f.frames.size).toBe(0);
  expect(f.power.attributes.get("aria-pressed")).toBe("false");
  for (const { light } of f.renders) {
    for (const value of Object.values(light)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  }
});

test("BFCache return after completed Home shutdown restores a lit, usable screen", async () => {
  const f = fixture();
  await f.initialize();
  f.advance(POWER_ON_MS);
  f.click(f.home);
  f.advance(POWER_OFF_MS);
  expect(f.destinations).toEqual([f.home.href]);
  expect(f.power.disabled).toBe(false);
  expect(f.replay.disabled).toBe(false);
  f.emit(f.window, "pagehide", { persisted: true });
  expect(f.frames.size).toBe(0);
  f.emit(f.window, "pageshow", { persisted: true });
  expect(f.root.dataset.crtPower).toBe("on");
  expect(f.power.disabled).toBe(false);
  expect(f.replay.disabled).toBe(false);
  expect(f.frames.size).toBe(1);
  f.advance(16);
  expect(f.renders.at(-1).light.gain).toBe(1);
  expect(f.renders.at(-1).light.y).toBe(1);
  expect(f.renders.at(-1).signal).toBe(true);
  f.click(f.power);
  f.advance(POWER_OFF_MS);
  expect(f.root.dataset.crtPower).toBe("off");
  expect(f.destinations).toEqual([f.home.href]);
  expect(f.disposals()).toBe(0);
});

test("another navigation during Home shutdown cancels the pending departure on BFCache return", async () => {
  const f = fixture();
  await f.initialize();
  f.advance(POWER_ON_MS);
  f.click(f.home);
  f.advance(100);
  expect(f.destinations).toEqual([]);
  f.emit(f.window, "pagehide", { persisted: true });
  f.emit(f.window, "pageshow", { persisted: true });
  expect(f.root.dataset.crtPower).toBe("on");
  expect(f.power.disabled).toBe(false);
  expect(f.replay.disabled).toBe(false);
  expect(f.frames.size).toBe(1);
  expect(f.renders.at(-1).light.gain).toBe(1);
  expect(f.renders.at(-1).light.y).toBe(1);
  f.advance(POWER_OFF_MS * 2);
  expect(f.destinations).toEqual([]);
  f.click(f.replay);
  f.advance(POWER_OFF_MS);
  expect(f.root.dataset.crtPower).toBe("starting");
  f.advance(POWER_ON_MS);
  expect(f.root.dataset.crtPower).toBe("on");
  expect(f.destinations).toEqual([]);
});

test("intentional Power off survives BFCache and Power can turn the screen on again", async () => {
  const f = fixture();
  await f.initialize();
  f.advance(POWER_ON_MS);
  f.click(f.power);
  f.advance(POWER_OFF_MS);
  f.emit(f.window, "pagehide", { persisted: true });
  f.emit(f.window, "pageshow", { persisted: true });
  expect(f.root.dataset.crtPower).toBe("off");
  expect(f.renders.at(-1).light.gain).toBe(0);
  expect(f.power.disabled).toBe(false);
  expect(f.power.attributes.get("aria-pressed")).toBe("false");
  expect(f.replay.disabled).toBe(false);
  expect(f.frames.size).toBe(0);
  f.click(f.power);
  expect(f.root.dataset.crtPower).toBe("starting");
  expect(f.frames.size).toBe(1);
  f.advance(POWER_ON_MS);
  expect(f.root.dataset.crtPower).toBe("on");
  expect(f.renders.at(-1).light.gain).toBe(1);
  expect(f.destinations).toEqual([]);
  expect(f.creations()).toBe(1);
  expect(f.disposals()).toBe(0);
});
