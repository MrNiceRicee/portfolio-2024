import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { registerEscapeDismissal } from "../src/scripts/escapeDismissal";

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

function component({ popoverSupported = true, modal = false, popover = false } = {}) {
  // only the DOM boundaries are doubled; the component and Escape helper run unchanged.
  class TestElement extends EventTarget {
    dataset = { status: "idle" };
    attributes = new Map([["aria-pressed", "false"]]);
    isContentEditable = false;
    tagName = "BUTTON";
    setAttribute(name, value) { this.attributes.set(name, value); }
    matches(selector) {
      return selector.split(", ").some((tag) => tag.toUpperCase() === this.tagName);
    }
    querySelector(selector) {
      if (selector !== "button") throw new Error(`Unexpected component selector: ${selector}`);
      return this.button;
    }
  }
  const window = new EventTarget();
  const document = new EventTarget();
  document.querySelector = (selector) => {
    if (!popoverSupported && selector.includes(":popover-open")) {
      throw new DOMException("Unsupported :popover-open selector", "SyntaxError");
    }
    if (selector.includes("dialog:modal") && modal) return {};
    if (selector.includes("[popover]:popover-open") && popover) return {};
    return null;
  };
  const CSS = {
    supports(query) {
      if (query !== "selector(:popover-open)") throw new Error(`Unexpected feature query: ${query}`);
      return popoverSupported;
    },
  };
  let Blurrable;
  const customElements = { define(_name, constructor) { Blurrable = constructor; } };
  const source = readFileSync(new URL("../src/components/Blurrable.astro", import.meta.url), "utf8");
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(
    script.replace(/import\s+\{\s*registerEscapeDismissal\s*\}\s+from\s+"\.\.\/scripts\/escapeDismissal";/, ""),
  );
  new Function("window", "document", "CSS", "customElements", "HTMLElement", "Element", "registerEscapeDismissal", executable)(
    window, document, CSS, customElements, TestElement, TestElement, registerEscapeDismissal,
  );
  return {
    reveal() {
      const element = new Blurrable();
      element.button = new TestElement();
      element.connectedCallback();
      element.button.dispatchEvent(new Event("click"));
      expect(element.button.dataset.status).toBe("active");
      expect(element.button.attributes.get("aria-pressed")).toBe("true");
      return element.button;
    },
    async escape(path = []) {
      const event = new Event("keydown", { cancelable: true });
      Object.assign(event, { key: "Escape", composedPath: () => path });
      window.dispatchEvent(event);
      await settle();
    },
    editingElement(tagName, isContentEditable = false) {
      const element = new TestElement();
      Object.assign(element, { tagName, isContentEditable });
      return element;
    },
  };
}

for (const popoverSupported of [false, true]) {
  test(`Escape closes all reveals with popover support=${popoverSupported}`, async () => {
    const runtime = component({ popoverSupported });
    const buttons = [runtime.reveal(), runtime.reveal()];
    await runtime.escape();
    for (const button of buttons) {
      expect(button.dataset.status).toBe("idle");
      expect(button.attributes.get("aria-pressed")).toBe("false");
    }
  });

  test(`a modal owns Escape with popover support=${popoverSupported}`, async () => {
    const runtime = component({ popoverSupported, modal: true });
    const button = runtime.reveal();
    await runtime.escape();
    expect(button.dataset.status).toBe("active");
    expect(button.attributes.get("aria-pressed")).toBe("true");
  });
}

test("an open supported popover owns Escape", async () => {
  const runtime = component({ popover: true });
  const button = runtime.reveal();
  await runtime.escape();
  expect(button.dataset.status).toBe("active");
});

test.each(["INPUT", "TEXTAREA", "SELECT", "DIV"])("editing %s owns Escape through the composed path", async (tagName) => {
  const runtime = component({ popoverSupported: false });
  const button = runtime.reveal();
  await runtime.escape([runtime.editingElement(tagName, tagName === "DIV")]);
  expect(button.dataset.status).toBe("active");
});
