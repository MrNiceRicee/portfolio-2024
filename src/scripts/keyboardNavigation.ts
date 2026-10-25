export function getListNavigationIndex(key: string, current: number, length: number) {
  switch (key) {
    case "ArrowDown":
      return (current + 1) % length;
    case "ArrowUp":
      return (current + length - 1) % length;
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return undefined;
  }
}
