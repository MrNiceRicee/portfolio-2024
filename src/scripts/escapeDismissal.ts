/** Low-priority Escape fallback. Overlays own Escape by preventing its default
 * or stopping propagation before it reaches this target (normally window).
 */
export function registerEscapeDismissal(
  target: EventTarget,
  dismiss: () => void,
  ownsInteraction: (event: KeyboardEvent) => boolean,
): void {
  target.addEventListener("keydown", (rawEvent) => {
    const event = rawEvent as KeyboardEvent;
    if (
      event.key !== "Escape" || event.defaultPrevented || event.isComposing ||
      event.repeat || event.ctrlKey || event.altKey || event.metaKey ||
      event.shiftKey || ownsInteraction(event)
    ) return;

    // Wait for the entire dispatch, including later listeners on this target.
    // A microtask can run between browser event listeners, so use a task here.
    setTimeout(() => {
      if (!event.defaultPrevented && !ownsInteraction(event)) dismiss();
    }, 0);
  });
}
