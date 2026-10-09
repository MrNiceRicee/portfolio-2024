/** Add header shortcuts without replacing native disclosure or Tab behavior. */
export function registerDetailsNavigation(
  list: EventTarget,
  headers: readonly Pick<HTMLElement, "focus">[],
): void {
  list.addEventListener("keydown", (rawEvent) => {
    const event = rawEvent as KeyboardEvent;
    if (event.defaultPrevented || event.isComposing || event.ctrlKey ||
      event.altKey || event.metaKey || event.shiftKey) return;
    // Only the direct headers participate. Descendant controls retain their keys.
    const current = headers.indexOf(event.target as HTMLElement);
    if (current < 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowDown": next = (current + 1) % headers.length; break;
      case "ArrowUp": next = (current + headers.length - 1) % headers.length; break;
      case "Home": next = 0; break;
      case "End": next = headers.length - 1; break;
      default: return;
    }
    event.preventDefault();
    headers[next]?.focus();
  });
}
