import { test, expect } from "bun:test";
import { registerDetailsNavigation } from "../src/scripts/detailsNavigation";

// Bun has no DOM: focus targets are doubles; browser checks cover real summary semantics.
function fixture() {
  const list = new EventTarget();
  let focused;
  const headers = Array.from({ length: 5 }, (_, index) => ({ focus() { focused = index; } }));
  registerDetailsNavigation(list, headers);
  function press(index, key, properties = {}) {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "target", { value: typeof index === "number" ? headers[index] : index });
    Object.assign(event, { key, ...properties });
    if (properties.handled) event.preventDefault();
    list.dispatchEvent(event);
    return event;
  }
  return { headers, press, focused: () => focused };
}

test("Up/Down move between headers and wrap at either edge", () => {
  const f = fixture();
  expect(f.press(0, "ArrowDown").defaultPrevented).toBe(true);
  expect(f.focused()).toBe(1);
  f.press(4, "ArrowDown"); expect(f.focused()).toBe(0);
  f.press(0, "ArrowUp"); expect(f.focused()).toBe(4);
  f.press(3, "ArrowUp"); expect(f.focused()).toBe(2);
});

test("Home/End select first/last header", () => {
  const f = fixture();
  f.press(2, "End"); expect(f.focused()).toBe(4);
  f.press(2, "Home"); expect(f.focused()).toBe(0);
});

test("Tab, native activation and horizontal arrows stay native", () => {
  const f = fixture();
  for (const key of ["Tab", "Enter", " ", "ArrowLeft", "ArrowRight", "Escape"]) expect(f.press(0, key).defaultPrevented).toBe(false);
  expect(f.focused()).toBeUndefined();
});

test("body links, spoilers, editing controls and nested summaries cannot navigate outer headers", () => {
  const f = fixture();
  for (const target of [{ tagName: "A" }, { tagName: "BUTTON" }, { tagName: "INPUT" }, { tagName: "SUMMARY" }]) expect(f.press(target, "ArrowDown").defaultPrevented).toBe(false);
  expect(f.focused()).toBeUndefined();
});

test("handled, composing, and modified keys yield", () => {
  const f = fixture();
  expect(f.press(0, "ArrowDown", { handled: true }).defaultPrevented).toBe(true);
  for (const properties of [{ isComposing: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }]) expect(f.press(0, "ArrowDown", properties).defaultPrevented).toBe(false);
  expect(f.focused()).toBeUndefined();
});
