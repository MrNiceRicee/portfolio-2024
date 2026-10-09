import { test, expect } from "bun:test";
import { registerEscapeDismissal } from "../src/scripts/escapeDismissal";

function escape(properties = {}) {
  const event = new Event("keydown", { cancelable: true });
  Object.assign(event, { key: "Escape", ...properties });
  return event;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

// Real EventTarget dispatch exercises competing listener order, not a mocked dispatcher.
test("Escape dismisses multiple reveals; no-open is harmless", async () => {
  const target = new EventTarget();
  const open = new Set(["MedBridge", "American Express"]);
  registerEscapeDismissal(target, () => open.clear(), () => false);
  target.dispatchEvent(escape());
  await settle();
  expect(open.size).toBe(0);
  target.dispatchEvent(escape());
  await settle();
  expect(open.size).toBe(0);
});

test("a higher-priority handler registered afterward consumes Escape first", async () => {
  const target = new EventTarget();
  const open = new Set(["spoiler"]);
  let sheetOpen = true;
  registerEscapeDismissal(target, () => open.clear(), () => false);
  target.addEventListener("keydown", (event) => {
    if (sheetOpen) { sheetOpen = false; event.preventDefault(); }
  });
  target.dispatchEvent(escape());
  await settle();
  expect(sheetOpen).toBe(false);
  expect(open.size).toBe(1);
  target.dispatchEvent(escape());
  await settle();
  expect(open.size).toBe(0);
});

test("already handled, composing, repeated and modified Escape yield", async () => {
  const target = new EventTarget();
  let dismissals = 0;
  registerEscapeDismissal(target, () => dismissals++, () => false);
  const handled = escape(); handled.preventDefault(); target.dispatchEvent(handled);
  for (const props of [{ isComposing: true }, { repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { key: "Enter" }]) target.dispatchEvent(escape(props));
  await settle();
  expect(dismissals).toBe(0);
});

test("native or editing interaction ownership yields even if no handler consumes Escape", async () => {
  const target = new EventTarget();
  let dismissals = 0;
  let ownsInteraction = true;
  registerEscapeDismissal(target, () => dismissals++, () => ownsInteraction);
  target.dispatchEvent(escape());
  ownsInteraction = false; // Native dialog can close as the event's default action.
  await settle();
  expect(dismissals).toBe(0);
});

test("an interaction opened later in the same event prevents fallback dismissal", async () => {
  const target = new EventTarget();
  let dismissals = 0;
  let ownsInteraction = false;
  registerEscapeDismissal(target, () => dismissals++, () => ownsInteraction);
  target.addEventListener("keydown", () => { ownsInteraction = true; });
  target.dispatchEvent(escape());
  await settle();
  expect(dismissals).toBe(0);
});
