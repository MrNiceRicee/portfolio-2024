import { beforeAll, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const output = new URL("../dist/", import.meta.url);
const production = "https://www.joshsantos.me/";
const env = loadEnv("production", fileURLToPath(new URL("../", import.meta.url)), "");
const assetBase = env.SOCIAL_ASSET_BASE_URL || production;
const assetUrl = (name) => new URL(`/social/${name}`, assetBase).href;
const metadata = new Map();
const iconPaths = new Set();
let canonical;
let playerVideo;
let playerSource;
let playerScripts = 0;

beforeAll(async () => {
  const homepage = await readFile(new URL("index.html", output), "utf8");
  await new HTMLRewriter()
    .on("head meta", {
      element(element) {
        const key = element.getAttribute("property") || element.getAttribute("name");
        if (!key) return;
        expect(metadata.has(key)).toBe(false);
        metadata.set(key, element.getAttribute("content"));
      },
    })
    .on('head link[rel="canonical"]', {
      element(element) {
        canonical = element.getAttribute("href");
      },
    })
    .on("head link", {
      element(element) {
        if (!["icon", "apple-touch-icon"].includes(element.getAttribute("rel"))) return;
        const url = new URL(element.getAttribute("href"), production);
        expect(url.origin).toBe(new URL(production).origin);
        iconPaths.add(url.pathname.slice(1));
      },
    })
    .transform(new Response(homepage))
    .text();

  const player = await readFile(new URL("social/player.html", output), "utf8");
  await new HTMLRewriter()
    .on("video", {
      element(element) {
        playerVideo = {
          controls: element.hasAttribute("controls"),
          loop: element.hasAttribute("loop"),
          playsinline: element.hasAttribute("playsinline"),
          autoplay: element.hasAttribute("autoplay"),
          muted: element.hasAttribute("muted"),
          preload: element.getAttribute("preload"),
          poster: element.getAttribute("poster"),
          label: element.getAttribute("aria-label"),
          width: element.getAttribute("width"),
          height: element.getAttribute("height"),
        };
      },
    })
    .on("video source", {
      element(element) {
        playerSource = { src: element.getAttribute("src"), type: element.getAttribute("type") };
      },
    })
    .on("script", {
      element() {
        playerScripts += 1;
      },
    })
    .transform(new Response(player))
    .text();
});

test("built homepage exposes video and image metadata without executing JavaScript", () => {
  expect(canonical).toBe(production);
  expect(metadata.get("og:url")).toBe(production);
  expect(metadata.get("og:type")).toBe("website");
  expect(metadata.get("og:title")).toBe("Josh's corner");
  expect(metadata.get("og:description")).toContain("Senior fullstack engineer");
  expect(metadata.get("og:video")).toBe(assetUrl("preview-v1.mp4"));
  expect(metadata.get("og:video:secure_url")).toBe(metadata.get("og:video"));
  expect(metadata.get("og:video:type")).toBe("video/mp4");
  expect(metadata.get("og:video:width")).toBe("1200");
  expect(metadata.get("og:video:height")).toBe("630");
  expect(metadata.get("og:image")).toBe(assetUrl("preview-v1.jpg"));
  expect(metadata.get("og:image:secure_url")).toBe(metadata.get("og:image"));
  expect(metadata.get("og:image:type")).toBe("image/jpeg");
  expect(metadata.get("og:image:width")).toBe("1200");
  expect(metadata.get("og:image:height")).toBe("630");
  expect(metadata.get("og:image:alt")).toContain("Joshua Constantine Santos");
});

test("player card points to HTML with a direct MP4 stream and image fallback", () => {
  expect(metadata.get("twitter:card")).toBe("player");
  expect(metadata.get("twitter:player")).toBe(assetUrl("player.html"));
  expect(metadata.get("twitter:player:width")).toBe("1200");
  expect(metadata.get("twitter:player:height")).toBe("630");
  expect(metadata.get("twitter:player:stream")).toBe(metadata.get("og:video"));
  expect(metadata.get("twitter:player:stream:content_type")).toBe("video/mp4");
  expect(metadata.get("twitter:image")).toBe(metadata.get("og:image"));
  expect(metadata.get("twitter:title")).toBe(metadata.get("og:title"));
  expect(metadata.get("twitter:description")).toBe(metadata.get("og:description"));
  for (const key of ["og:url", "og:video", "og:image", "twitter:player"]) {
    const url = new URL(metadata.get(key));
    expect(url.protocol).toBe("https:");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  }
});

test("standalone player provides native accessible playback without autoplay or scripts", () => {
  expect(playerVideo).toEqual({
    controls: true,
    loop: true,
    playsinline: true,
    autoplay: false,
    muted: true,
    preload: "metadata",
    poster: "./preview-v1.jpg",
    label: "Josh's corner — animated portfolio preview",
    width: "1200",
    height: "630",
  });
  expect(playerSource).toEqual({ src: "./preview-v1.mp4", type: "video/mp4" });
  expect(playerScripts).toBe(0);
});

test("built preview resources exist, have the expected formats and fit the Messages budget", async () => {
  const imagePath = new URL("social/preview-v1.jpg", output);
  const videoPath = new URL("social/preview-v1.mp4", output);
  const [image, video, imageInfo, videoInfo, pageInfo, playerInfo] = await Promise.all([
    readFile(imagePath),
    readFile(videoPath),
    stat(imagePath),
    stat(videoPath),
    stat(new URL("index.html", output)),
    stat(new URL("social/player.html", output)),
  ]);
  expect(image.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  expect(video.subarray(4, 8).toString("ascii")).toBe("ftyp");
  expect(iconPaths.size).toBeGreaterThan(0);
  const iconInfo = await Promise.all([...iconPaths].map((path) => stat(new URL(path, output))));
  const iconBytes = iconInfo.reduce((total, info) => total + info.size, 0);
  expect(pageInfo.size).toBeLessThan(1_000_000);
  expect(imageInfo.size + videoInfo.size + playerInfo.size + iconBytes).toBeLessThan(10_000_000);
});
