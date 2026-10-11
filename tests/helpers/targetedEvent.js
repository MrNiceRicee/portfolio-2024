export function targetedEvent(type, target, properties = {}) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "target", { value: target });
  Object.assign(event, properties);
  return event;
}
