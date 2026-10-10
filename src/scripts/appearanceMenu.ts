/** focus and dismissal belong to the menu; preference belongs to the theme runtime */
export function initializeAppearanceMenu(controls: HTMLElement, signal: AbortSignal) {
  const trigger = controls.querySelector<HTMLButtonElement>("[data-theme-trigger]");
  const menu = controls.querySelector<HTMLElement>("[data-theme-menu]");
  const items = Array.from(controls.querySelectorAll<HTMLButtonElement>("[data-theme-choice]"));
  if (!trigger || !menu || !items.length || signal.aborted) return;
  const options = { signal };
  let open = false;

  const focusItem = (index: number) => {
    items.forEach((item, position) => { item.tabIndex = position === index ? 0 : -1; });
    items[index]?.focus({ preventScroll: true });
  };
  const close = (returnFocus: boolean) => {
    if (!open) return;
    open = false;
    controls.dataset.open = "false";
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger.focus({ preventScroll: true });
    menu.inert = true;
    items.forEach((item) => { item.tabIndex = -1; });
  };
  const show = (index: number) => {
    open = true;
    menu.inert = false;
    controls.dataset.open = "true";
    trigger.setAttribute("aria-expanded", "true");
    focusItem(index);
  };

  trigger.addEventListener("click", (event) => {
    const keyboard = event.detail === 0;
    controls.dataset.interaction = keyboard ? "keyboard" : "pointer";
    if (open) close(true);
    else show(keyboard ? 0 : Math.max(0, items.findIndex((item) => item.getAttribute("aria-checked") === "true")));
  }, options);
  items.forEach((item) => item.addEventListener("click", (event) => {
    controls.dataset.interaction = event.detail === 0 ? "keyboard" : "pointer";
    close(true);
  }, options));
  controls.addEventListener("keydown", (event) => {
    controls.dataset.interaction = "keyboard";
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target === trigger && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      show(event.key === "ArrowUp" ? items.length - 1 : 0);
      return;
    }
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") { close(true); return; }
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case "ArrowDown": next = (index + 1) % items.length; break;
      case "ArrowUp": next = (index + items.length - 1) % items.length; break;
      case "Home": next = 0; break;
      case "End": next = items.length - 1; break;
      default: return;
    }
    event.preventDefault();
    focusItem(next);
  }, options);
  controls.addEventListener("focusout", (event) => {
    if (!controls.contains(event.relatedTarget as Node | null)) close(false);
  }, options);
  document.addEventListener("pointerdown", (event) => {
    if (controls.contains(event.target as Node)) controls.dataset.interaction = "pointer";
    else if (open) event.preventDefault();
  }, { ...options, capture: true });
  document.addEventListener("click", (event) => {
    if (!open || controls.contains(event.target as Node)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close(true);
  }, { ...options, capture: true });
  signal.addEventListener("abort", () => close(false), { once: true });
  menu.inert = true;
  menu.hidden = false;
}
