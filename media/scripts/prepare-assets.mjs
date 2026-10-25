import { copyFile, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const assets = [
  ["../src/assets/silly-guy/eyes_open_mouth_closed.webp", "character.webp"],
  ["assets/character/talking.webp", "character-talking.webp"],
  ["assets/character/blinking.webp", "character-blinking.webp"],
  ["assets/character/talking-blinking.webp", "character-talking-blinking.webp"],
  ["../src/assets/paper-fibers-light.webp", "paper.webp"],
  ["../public/fonts/portfolio/ibm-plex-sans-latin-variable.woff2", "plex.woff2"],
];

await mkdir(new URL("public/", root), { recursive: true });
await mkdir(new URL("../public/social/", root), { recursive: true });
await Promise.all(assets.map(([source, name]) =>
  copyFile(new URL(source, root), new URL(`public/${name}`, root)),
));
