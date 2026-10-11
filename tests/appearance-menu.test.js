import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initializeAppearanceMenu } from "../src/scripts/appearanceMenu";
import { registerEscapeDismissal } from "../src/scripts/escapeDismissal";

const blurrableSource = readFileSync(new URL("../src/components/Blurrable.astro", import.meta.url), "utf8")
  .match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/import \{ registerEscapeDismissal \} from "[^";]+";/, "");
const compiledBlurrable = new Bun.Transpiler({ loader: "ts" }).transformSync(blurrableSource);
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

async function withMenu(run) {
  const keys = ["document", "window", "HTMLElement", "Element", "customElements"];
  const originals = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  const document = Object.assign(new EventTarget(), { activeElement: null, querySelector: () => null });
  class Element extends EventTarget {
    dataset = {};
    attributes = {};
    children = [];
    tabIndex = -1;
    hidden = false;
    inert = false;
    focusScrollY = 3000;
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
    focus(options) {
      document.activeElement = this;
      // offscreen focus scrolls unless the caller explicitly preserves the viewport
      if (!options?.preventScroll) window.scrollY = this.focusScrollY;
    }
    matches() { return false; }
    closest(selector) {
      if (selector.includes("[data-theme-controls]") && controls.contains(this)) return controls;
      if (selector.includes("astro-blurrable") && spoiler?.contains(this)) return spoiler;
      return null;
    }
  }
  const trigger = new Element(), menu = new Element(), controls = new Element();
  const items = ["light", "dark", "system"].map((value) => {
    const item = new Element();
    item.dataset.themeChoice = value;
    item.setAttribute("aria-checked", String(value === "system"));
    return item;
  });
  controls.children = [trigger, menu]; menu.children = items;
  controls.querySelectorAll = () => items;
  controls.querySelector = (selector) => selector === "[data-theme-trigger]" ? trigger : selector === "[data-theme-menu]" ? menu : null;
  const window = Object.assign(new EventTarget(), { scrollY: 500 });
  let SpoilerClass, spoiler;
  const values = { document, window, HTMLElement: Element, Element, customElements: { define(_, value) { SpoilerClass = value; } } };
  const lifetime = new AbortController();
  const event = (type, target, properties = {}) => {
    const result = new Event(type, { cancelable: true });
    Object.defineProperty(result, "target", { value: target });
    Object.assign(result, { detail: 1, ...properties });
    return result;
  };
  const click = (node, detail = 1) => {
    const result = event("click", node, { detail });
    document.dispatchEvent(result);
    if (!result.defaultPrevented) node.dispatchEvent(result);
    return result;
  };
  const key = (value, target = document.activeElement, properties = {}) => {
    const result = event("keydown", target, { key: value, ...properties });
    controls.dispatchEvent(result);
    window.dispatchEvent(result);
    return result;
  };
  try {
    keys.forEach((name) => Object.defineProperty(globalThis, name, { value: values[name], configurable: true, writable: true }));
    initializeAppearanceMenu(controls, lifetime.signal);
    // EventTarget has no DOM tree: this registration order represents the
    // document capture controller running before the actual spoiler bubble listener.
    new Function("registerEscapeDismissal", compiledBlurrable)(registerEscapeDismissal);
    spoiler = new SpoilerClass();
    const spoilerButton = new Element();
    spoiler.children = [spoilerButton]; spoiler.querySelector = () => spoilerButton;
    spoiler.connectedCallback();
    await run({ controls, trigger, menu, items, document, window, lifetime, click, key, event, spoilerButton, Element });
  } finally {
    lifetime.abort();
    keys.forEach((name, index) => originals[index] ? Object.defineProperty(globalThis, name, originals[index]) : delete globalThis[name]);
  }
}

test("keyboard and pointer opening, roving navigation and persistent selection", async () => {
  await withMenu(({ controls, trigger, menu, items, document, window, click, key }) => {
    expect(menu.inert).toBe(true);
    click(trigger); expect(document.activeElement).toBe(items[2]);
    expect(window.scrollY).toBe(500);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    for (const [navigation, index] of [["ArrowDown", 0], ["ArrowUp", 2], ["Home", 0], ["End", 2]]) {
      expect(key(navigation).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(items[index]);
      expect(window.scrollY).toBe(500);
    }
    expect(items.map((item) => item.tabIndex)).toEqual([-1, -1, 0]);
    items.forEach((item) => item.setAttribute("aria-checked", String(item === items[1])));
    click(items[1], 0);
    expect(document.activeElement).toBe(items[1]);
    expect(menu.inert).toBe(false);
    expect(controls.dataset.open).toBe("true");
    expect(items.map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
    expect(items[1].getAttribute("aria-checked")).toBe("true");
    expect(window.scrollY).toBe(500);
    key("Escape");
    expect(document.activeElement).toBe(trigger);
    expect(menu.inert).toBe(true);
    click(trigger, 0); expect(document.activeElement).toBe(items[0]);
    expect(controls.dataset.interaction).toBe("keyboard");
    key("Escape");
    expect(key("ArrowUp", trigger).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[2]);
    expect(window.scrollY).toBe(500);
    key("Escape");
    expect(key("ArrowDown", trigger).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]);
    expect(window.scrollY).toBe(500);
  });
});

test("Escape and trigger dismissal return focus without scrolling", async () => {
  await withMenu(({ trigger, menu, document, window, click, key }) => {
    for (const dismiss of [() => key("Escape"), () => click(trigger)]) {
      click(trigger);
      dismiss();
      expect(document.activeElement).toBe(trigger);
      expect(menu.inert).toBe(true);
      expect(window.scrollY).toBe(500);
    }
  });
});

test("Tab and ShiftTab close without canceling native traversal; focus departure closes without stealing focus", async () => {
  await withMenu(({ controls, trigger, menu, document, window, click, key, event, Element }) => {
    for (const shiftKey of [false, true]) {
      click(trigger, 0);
      window.scrollY = 500;
      expect(key("Tab", document.activeElement, { shiftKey }).defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(trigger);
      expect(menu.inert).toBe(true);
      expect(window.scrollY).toBe(500);
      // the browser's uncanceled Tab default can still reveal the next destination
      const destination = new Element(); destination.focusScrollY = shiftKey ? 200 : 3500;
      destination.focus();
      expect(document.activeElement).toBe(destination);
      expect(window.scrollY).toBe(destination.focusScrollY);
    }
    click(trigger);
    const outside = new Element(); outside.focus();
    controls.dispatchEvent(event("focusout", trigger, { relatedTarget: outside }));
    expect(menu.inert).toBe(true);
    expect(document.activeElement).toBe(outside);
  });
});

test("actual Blurrable listeners retain reveals for menu clicks and consumed Escape, then ordinary Escape dismisses", async () => {
  await withMenu(async ({ trigger, items, click, key, spoilerButton }) => {
    click(spoilerButton); expect(spoilerButton.dataset.status).toBe("active");
    click(trigger); expect(spoilerButton.dataset.status).toBe("active");
    click(items[0]); expect(spoilerButton.dataset.status).toBe("active");
    const escape = key("Escape");
    expect(escape.defaultPrevented).toBe(true);
    await settle(); expect(spoilerButton.dataset.status).toBe("active");
    key("Escape");
    await settle(); expect(spoilerButton.dataset.status).toBe("idle");
  });
});

test("first outside click only dismisses the menu; the next ordinary click retains spoiler fallback behavior", async () => {
  await withMenu(({ trigger, click, spoilerButton, Element, document }) => {
    const outside = new Element();
    let activations = 0; outside.addEventListener("click", () => { activations++; });
    click(spoilerButton); click(trigger);
    expect(click(outside).defaultPrevented).toBe(true);
    expect(activations).toBe(0);
    expect(document.activeElement).toBe(trigger);
    expect(spoilerButton.dataset.status).toBe("active");
    expect(click(outside).defaultPrevented).toBe(false);
    expect(activations).toBe(1);
    expect(spoilerButton.dataset.status).toBe("idle");
  });
});

test("shared lifetime abort closes owned UI and releases all menu listeners", async () => {
  await withMenu(({ controls, trigger, menu, click, key, lifetime, document, event, Element }) => {
    click(trigger);
    lifetime.abort();
    expect(menu.inert).toBe(true);
    expect(controls.dataset.open).toBe("false");
    click(trigger); key("ArrowDown", trigger);
    expect(controls.dataset.open).toBe("false");
    const outside = new Element();
    const down = event("pointerdown", outside); document.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    expect(click(outside).defaultPrevented).toBe(false);
  });
});
