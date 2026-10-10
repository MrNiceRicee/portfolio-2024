import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initializeProposalFilm } from "../src/scripts/proposalFilm";
import { initializePortfolioTheme } from "../src/scripts/portfolioTheme";

const layout = readFileSync(new URL("../src/layouts/Layout.astro", import.meta.url), "utf8");
const headScript = layout.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];

function resolveHead({ saved = null, preview, systemDark = false, storageThrows = false, proposal = true } = {}) {
  let dark = false;
  const root = {
    dataset: { proposalTheme: preview },
    hasAttribute: () => proposal,
    classList: { toggle: (_, value) => { dark = value; }, contains: () => dark },
  };
  const window = {
    localStorage: { getItem() { if (storageThrows) throw new Error("blocked"); return saved; } },
    matchMedia: () => ({ matches: systemDark }),
  };
  new Function("document", "window", headScript)({ documentElement: root }, window);
  return { preference: root.dataset.themePreference, dark };
}

test("early head uses preview, remembered choice, then System before content on portfolio and asset layouts", () => {
  expect(resolveHead({ saved: "dark" })).toEqual({ preference: "dark", dark: true });
  expect(resolveHead({ saved: "light", systemDark: true, proposal: false })).toEqual({ preference: "light", dark: false });
  expect(resolveHead({ saved: "dark", preview: "light", systemDark: true })).toEqual({ preference: "light", dark: false });
  expect(resolveHead({ saved: "light", preview: "dark" })).toEqual({ preference: "dark", dark: true });
  for (const saved of [null, "", "LIGHT", "constructor", "unknown", "system"]) {
    expect(resolveHead({ saved, preview: "system", systemDark: true })).toEqual({ preference: "system", dark: true });
  }
  expect(resolveHead({ saved: "dark", storageThrows: true })).toEqual({ preference: "system", dark: false });
});

async function withRuntime(run, { saved = "light", preview = "dark", storageThrows = false, historyThrows = false } = {}) {
  const keys = ["document", "window", "matchMedia", "IntersectionObserver", "requestAnimationFrame"];
  const originals = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  let dark = preview === "dark", storageReads = 0, animationFrames = 0, intersections;
  const root = {
    dataset: { proposalTheme: preview, shaderStatus: "ready", film: "original" },
    hasAttribute: () => false,
    classList: { contains: () => dark, toggle: (_, value) => { dark = value; } },
  };
  const radios = ["light", "dark", "system"].map((value) => Object.assign(new EventTarget(), { value, checked: false }));
  const controls = Object.assign(new EventTarget(), { hidden: true, querySelectorAll: () => radios });
  const pause = new EventTarget();
  const metadata = Object.fromEntries(["theme-color", "apple-mobile-web-app-status-bar-style"].map((name) => [name, { setAttribute(_, value) { this.content = value; } }]));
  const document = Object.assign(new EventTarget(), {
    documentElement: root, hidden: false,
    body: { dataset: { darkcolor: "#181615", lightcolor: "#ebebec" } },
    querySelector(selector) {
      if (selector === "[data-theme-controls]") return controls;
      if (selector === "[data-pause-film]") return pause;
      if (selector === "[data-proposal-film]") return {};
      return metadata[selector.match(/meta\[name="([^"]+)"\]/)?.[1]] ?? null;
    },
  });
  const system = Object.assign(new EventTarget(), { matches: false });
  const reduced = Object.assign(new EventTarget(), { matches: false });
  const forced = Object.assign(new EventTarget(), { matches: false });
  const storage = new Map([["portfolio-theme", saved]]);
  const replacements = [];
  const window = Object.assign(new EventTarget(), {
    matchMedia: () => system,
    location: { href: "https://example.com/?theme=dark&surface=fibers&film=original#contact" },
    localStorage: {
      getItem(key) { storageReads++; if (storageThrows) throw new Error("blocked"); return storage.get(key); },
      setItem(key, value) { if (storageThrows) throw new Error("blocked"); storage.set(key, value); },
    },
    history: { state: { intact: true }, replaceState(state, _, url) {
      if (historyThrows) throw new Error("blocked");
      replacements.push({ state, url: String(url) }); window.location.href = String(url);
    } },
  });
  const values = {
    document, window,
    matchMedia: (query) => query.includes("reduced") ? reduced : forced,
    IntersectionObserver: class { constructor(fn) { intersections = fn; } observe() {} disconnect() {} },
    requestAnimationFrame() { animationFrames++; return 1; },
  };
  const choose = (value) => {
    const radio = radios.find((entry) => entry.value === value);
    radios.forEach((entry) => { entry.checked = entry === radio; });
    radio.dispatchEvent(new Event("change"));
  };
  const osTheme = (value) => { system.matches = value; system.dispatchEvent(new Event("change")); };
  const hide = (persisted) => window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted }));
  try {
    keys.forEach((key) => Object.defineProperty(globalThis, key, { value: values[key], configurable: true, writable: true }));
    new Function("document", "window", headScript)(document, window);
    storageReads = 0;
    initializePortfolioTheme();
    await run({ root, controls, radios, metadata, storage, replacements, window, reduced, pause, choose, osTheme, hide,
      dark: () => dark, storageReads: () => storageReads, animationFrames: () => animationFrames,
      startFilm() { initializeProposalFilm(true); intersections([{ isIntersecting: true }]); },
    });
  } finally {
    hide(false);
    keys.forEach((key, index) => originals[index] ? Object.defineProperty(globalThis, key, originals[index]) : delete globalThis[key]);
  }
}

test("runtime consumes the head preview, persists intentional choices, and strips only the theme query", async () => {
  await withRuntime(({ root, controls, radios, metadata, storage, replacements, choose, osTheme, dark, storageReads }) => {
    expect(controls.hidden).toBe(false);
    expect(radios.map((radio) => radio.checked)).toEqual([false, true, false]);
    expect(storageReads()).toBe(0);
    expect(storage.get("portfolio-theme")).toBe("light");
    expect(metadata["theme-color"].content).toBe("#181615");
    expect(metadata["apple-mobile-web-app-status-bar-style"].content).toBe("black-translucent");
    osTheme(true); osTheme(false); expect(dark()).toBe(true);
    choose("light"); osTheme(true); expect(dark()).toBe(false);
    expect(root.dataset.themePreference).toBe("light");
    expect(metadata["theme-color"].content).toBe("#ebebec");
    expect(storage.get("portfolio-theme")).toBe("light");
    expect(replacements).toEqual([{ state: { intact: true }, url: "https://example.com/?surface=fibers&film=original#contact" }]);
    expect(resolveHead({ saved: storage.get("portfolio-theme"), systemDark: true })).toEqual({ preference: "light", dark: false });
    choose("system"); expect(dark()).toBe(true);
    osTheme(false); expect(dark()).toBe(false);
    expect(radios.map((radio) => radio.checked)).toEqual([false, false, true]);
    expect(storage.get("portfolio-theme")).toBe("system");
  });
});

test("theme choices tolerate storage/history denial and retain native state through BFCache, then release listeners", async () => {
  await withRuntime(({ choose, osTheme, hide, dark, root }) => {
    choose("light"); expect(dark()).toBe(false);
    choose("system"); osTheme(true); expect(dark()).toBe(true);
    hide(true); osTheme(false); expect(dark()).toBe(false);
    hide(false); osTheme(true); expect(dark()).toBe(false);
    choose("dark"); expect(dark()).toBe(false);
    expect(root.dataset.themePreference).toBe("system");
  }, { storageThrows: true, historyThrows: true });
});

test("theme changes leave a user-paused film and reduced-motion eligibility stopped without animation work", async () => {
  await withRuntime(({ startFilm, pause, choose, root, reduced, animationFrames }) => {
    startFilm(); expect(root.dataset.filmMotion).toBe("running");
    pause.dispatchEvent(new Event("click"));
    for (const choice of ["light", "dark", "system"]) choose(choice);
    expect(root.dataset.filmMotion).toBe("paused");
    expect(root.dataset.filmMotionReason).toBe("user-paused");
    expect(pause.textContent).toBe("Resume film");
    reduced.matches = true; reduced.dispatchEvent(new Event("change"));
    choose("dark");
    expect(root.dataset.filmMotionReason).toBe("reduced-motion");
    expect(pause.hidden).toBe(true);
    expect(animationFrames()).toBe(0);
  });
});
