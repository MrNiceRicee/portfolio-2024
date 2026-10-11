import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initializeProposalFilm } from "../src/scripts/proposalFilm";
import { initializePortfolioTheme } from "../src/scripts/portfolioTheme";

const layout = readFileSync(new URL("../src/layouts/Layout.astro", import.meta.url), "utf8");
const headScript = layout.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];

function resolveHead({ saved = null, preview, systemDark = false, storageThrows = false } = {}) {
  let dark = false;
  const root = {
    dataset: { proposalTheme: preview },
    classList: { toggle: (_, value) => { dark = value; } },
  };
  const window = {
    localStorage: { getItem() { if (storageThrows) throw new Error("blocked"); return saved; } },
    matchMedia: () => ({ matches: systemDark }),
  };
  new Function("document", "window", headScript)({ documentElement: root }, window);
  return { preference: root.dataset.themePreference, dark };
}

test("early head uses preview, remembered choice, then System before content", () => {
  expect(resolveHead({ saved: "dark" })).toEqual({ preference: "dark", dark: true });
  expect(resolveHead({ saved: "light", systemDark: true })).toEqual({ preference: "light", dark: false });
  expect(resolveHead({ saved: "dark", preview: "light", systemDark: true })).toEqual({ preference: "light", dark: false });
  expect(resolveHead({ saved: "light", preview: "dark" })).toEqual({ preference: "dark", dark: true });
  for (const saved of [null, "", "LIGHT", "constructor", "unknown", "system"]) {
    expect(resolveHead({ saved, preview: "system", systemDark: true })).toEqual({ preference: "system", dark: true });
  }
  expect(resolveHead({ saved: "dark", storageThrows: true })).toEqual({ preference: "system", dark: false });
});

async function withRuntime(run, { saved = "light", preview = "dark", storageThrows = false, historyThrows = false } = {}) {
  const keys = ["document", "window", "matchMedia", "IntersectionObserver"];
  const originals = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  let dark = preview === "dark", storageReads = 0, storageWrites = 0, intersections;
  const writes = [];
  const dataset = (initial) => new Proxy(initial, { set(target, name, value) {
    writes.push([String(name), value]); target[name] = value; return true;
  } });
  const root = {
    dataset: dataset({ proposalTheme: preview, shaderStatus: "ready" }),
    hasAttribute: () => false,
    classList: { contains: () => dark, toggle: (_, value) => { writes.push(["dark", value]); dark = value; } },
  };
  const element = (initial = {}) => Object.assign(new EventTarget(), {
    dataset: dataset(initial), attributes: {}, children: [], tabIndex: -1,
    setAttribute(name, value) { writes.push([name, value]); this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); },
    focus() { writes.push(["focus", this]); document.activeElement = this; },
  });
  const buttons = ["light", "dark", "system"].map((value) => element({ themeChoice: value }));
  const icons = ["trigger", "menu"].flatMap(() => ["light", "dark", "system"].map((kind) => element({ appearanceIcon: kind })));
  buttons.forEach((button, index) => { button.children = [icons[index + 3]]; });
  let labelText = "System";
  const label = { get textContent() { return labelText; }, set textContent(value) { writes.push(["label", value]); labelText = value; } };
  const trigger = element(), menu = element(), controls = element();
  trigger.children = icons.slice(0, 3); menu.children = buttons; controls.children = [trigger, menu];
  controls.hidden = true;
  controls.querySelectorAll = (selector) => selector === "[data-appearance-icon]" ? icons : buttons;
  controls.querySelector = (selector) => ({ "[data-theme-label]": label, "[data-theme-trigger]": trigger, "[data-theme-menu]": menu })[selector] ?? null;
  const pause = new EventTarget();
  const metadata = Object.fromEntries(["theme-color", "apple-mobile-web-app-status-bar-style"].map((name) => [name, { setAttribute(_, value) { writes.push([name, value]); this.content = value; } }]));
  const document = Object.assign(new EventTarget(), {
    documentElement: root, hidden: false, activeElement: null,
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
    matchMedia: (query) => query.includes("reduced") ? reduced : system,
    location: { href: "https://example.com/?theme=dark&surface=fibers&film=original#contact" },
    localStorage: {
      getItem(key) { storageReads++; if (storageThrows) throw new Error("blocked"); return storage.get(key); },
      setItem(key, value) { storageWrites++; if (storageThrows) throw new Error("blocked"); storage.set(key, value); },
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
  };
  const event = (type, target, properties = {}) => {
    const result = new Event(type, { cancelable: true });
    Object.defineProperty(result, "target", { value: target });
    Object.assign(result, properties);
    return result;
  };
  const choose = (value, detail = 1) => {
    const button = buttons.find((entry) => entry.dataset.themeChoice === value);
    button.dispatchEvent(event("click", button, { detail }));
  };
  const open = () => trigger.dispatchEvent(event("click", trigger, { detail: 1 }));
  const key = (value, target) => controls.dispatchEvent(event("keydown", target, { key: value }));
  const pointer = (target) => {
    const result = event("pointerdown", target); document.dispatchEvent(result); return result;
  };
  const osTheme = (value) => { system.matches = value; system.dispatchEvent(new Event("change")); };
  const hide = (persisted) => window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted }));
  try {
    keys.forEach((key) => Object.defineProperty(globalThis, key, { value: values[key], configurable: true, writable: true }));
    new Function("document", "window", headScript)(document, window);
    storageReads = 0;
    initializePortfolioTheme();
    await run({ root, controls, buttons, icons, label, trigger, menu, document, metadata, storage, replacements, window, reduced, pause, choose, open, key, pointer, osTheme, hide,
      dark: () => dark, storageReads: () => storageReads, storageWrites: () => storageWrites, writes,
      startFilm() { initializeProposalFilm(); intersections([{ isIntersecting: true }]); },
    });
  } finally {
    hide(false);
    keys.forEach((key, index) => originals[index] ? Object.defineProperty(globalThis, key, originals[index]) : delete globalThis[key]);
  }
}

test("runtime consumes the head preview, persists intentional choices, and strips only the theme query", async () => {
  await withRuntime(({ root, controls, buttons, label, trigger, metadata, storage, replacements, choose, osTheme, dark, storageReads }) => {
    expect(controls.hidden).toBe(false);
    expect(controls.dataset.preference).toBe("dark");
    expect(label.textContent).toBe("Dark");
    expect(trigger.attributes["aria-label"]).toBe("Appearance: Dark");
    expect(buttons.map((button) => button.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
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
    expect(buttons.map((button) => button.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
    expect(storage.get("portfolio-theme")).toBe("system");
    expect(controls.dataset.preference).toBe("system");
    expect(label.textContent).toBe("System");
    expect(trigger.attributes["aria-label"]).toBe("Appearance: System");
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

test("theme changes preserve a user-paused film and reduced-motion eligibility", async () => {
  await withRuntime(({ startFilm, pause, choose, root, reduced }) => {
    startFilm(); expect(root.dataset.filmMotion).toBe("running");
    pause.dispatchEvent(new Event("click"));
    for (const choice of ["light", "dark", "system"]) choose(choice);
    expect(root.dataset.filmMotion).toBe("paused");
    expect(pause.textContent).toBe("Resume film");
    reduced.matches = true; reduced.dispatchEvent(new Event("change"));
    choose("dark");
    expect(root.dataset.filmMotion).toBe("paused");
    expect(pause.hidden).toBe(true);
  });
});


test("homepage selections keep their drawing visible, retarget states and retain roving focus", async () => {
  await withRuntime(({ controls, buttons, icons, menu, document, choose, open, key, trigger, storageWrites }) => {
    open();
    for (const value of ["light", "dark", "system", "light"]) {
      choose(value);
      expect(controls.dataset.open).toBe("true");
      expect(menu.inert).toBe(false);
      const selected = buttons.find((button) => button.dataset.themeChoice === value);
      expect(document.activeElement).toBe(selected);
      expect(buttons.map((button) => button.tabIndex)).toEqual(buttons.map((button) => button === selected ? 0 : -1));
      expect(icons.map((icon) => icon.dataset.state)).toEqual(["light", "dark", "system", "light", "dark", "system"].map((kind) => kind === value ? "active" : "idle"));
      expect(icons.every((icon) => icon.dataset.instant === "false")).toBe(true);
    }
    expect(storageWrites()).toBe(4);
    key("ArrowDown", document.activeElement);
    choose("dark", 0);
    expect(icons.every((icon) => icon.dataset.instant === "true")).toBe(true);
    expect(controls.dataset.open).toBe("true");
    key("Escape", document.activeElement);
    expect(menu.inert).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});

test("current choice pointer, activation and modifier preambles perform zero writes and preserve ongoing motion", async () => {
  await withRuntime(({ buttons, icons, controls, choose, open, pointer, key, writes, storageWrites, replacements, window }) => {
    open(); choose("light");
    const current = buttons[0];
    expect(icons[0].dataset.instant).toBe("false");
    const count = writes.length, storageCount = storageWrites(), replacementCount = replacements.length;
    const interaction = controls.dataset.interaction;
    const href = window.location.href;
    for (const target of [current, current.children[0]]) {
      expect(pointer(target).defaultPrevented).toBe(false);
      for (const value of ["Enter", " ", "Control", "Alt", "Meta", "Shift"]) expect(key(value, target)).toBe(true);
    }
    for (const detail of [1, 0]) choose("light", detail);
    expect(writes.length).toBe(count);
    expect(storageWrites()).toBe(storageCount);
    expect(replacements.length).toBe(replacementCount);
    expect(window.location.href).toBe(href);
    expect(controls.dataset.interaction).toBe(interaction);
    expect(icons[0].dataset.instant).toBe("false");
    expect(controls.dataset.open).toBe("true");
    key("ArrowDown", current);
    expect(writes.length).toBeGreaterThan(count);
  });
});

test("System artwork follows the device independently of explicit palette and finishes motion on lifecycle changes", async () => {
  await withRuntime(({ icons, reduced, choose, osTheme, hide, dark, root, open, menu, storageWrites }) => {
    const monitors = icons.filter((icon) => icon.dataset.appearanceIcon === "system");
    choose("light"); osTheme(true);
    expect(dark()).toBe(false);
    expect(monitors.every((icon) => icon.dataset.deviceTheme === "dark" && icon.dataset.state === "idle")).toBe(true);
    choose("system");
    expect(dark()).toBe(true);
    expect(monitors.every((icon) => icon.dataset.state === "active")).toBe(true);
    choose("dark"); osTheme(false);
    expect(dark()).toBe(true);
    expect(monitors.every((icon) => icon.dataset.deviceTheme === "light" && icon.dataset.state === "idle")).toBe(true);
    choose("light");
    reduced.matches = true; reduced.dispatchEvent(new Event("change"));
    expect(icons.every((icon) => icon.dataset.instant === "true")).toBe(true);
    choose("dark"); expect(icons.every((icon) => icon.dataset.instant === "true")).toBe(true);
    reduced.matches = false; reduced.dispatchEvent(new Event("change"));
    choose("light"); expect(icons.every((icon) => icon.dataset.instant === "false")).toBe(true);
    open(); hide(true);
    expect(icons.every((icon) => icon.dataset.instant === "true")).toBe(true);
    expect(menu.inert).toBe(false);
    choose("system"); osTheme(true); expect(dark()).toBe(true);
    hide(false); expect(menu.inert).toBe(true);
    const count = storageWrites();
    choose("dark"); osTheme(false);
    expect(storageWrites()).toBe(count);
    expect(root.dataset.themePreference).toBe("system");
    expect(monitors.every((icon) => icon.dataset.deviceTheme === "dark")).toBe(true);
  });
});
