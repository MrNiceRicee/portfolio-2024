# Social preview media

An editable Remotion composition exports the matching 1200 × 630 JPEG and six-second silent H.264 video. This is a separate authoring project; the Astro site serves only the exported files.

```sh
cd media
bun install --frozen-lockfile
bun run studio
```

Change `src/portfolio.tsx`, then run `bun run check` and `bun run render`. The render writes `../public/social/preview-v1.jpg` and `../public/social/preview-v1.mp4`. It uses a 30 fps timeline, H.264/yuv420p video, and a JPEG at frame 0. `prepare-assets` copies the existing character master, paper texture and IBM Plex font into the ignored local public folder. Keep the original artwork and its Gyuppii attribution on the site.

The text stays visible throughout the loop. The character swaps between original mouth and eye drawings for silent speech bursts and blinks. All four images share the original 1500 × 1500 canvas and are loaded together to avoid blank frames. The additional drawings in `assets/character/` were recovered byte-for-byte from the parent of commit `65138fd`. Their names describe the inspected expression; the historical closed-eye filenames had the mouth states reversed.

The media contains no audio or flashes. Playback, looping, autoplay and reduced-motion behavior in sharing apps are controlled by those apps; a video file cannot inspect their preferences. The embedded site player starts paused with native controls and loops after the user starts playback.

The downward triangle's sun backdrop preserves the eight ray groups and three beams per group from the [CC0 Filipino sun vector by Achim1999, refined by Vizorsols](https://commons.wikimedia.org/wiki/File:Sun_Symbol_of_the_National_Flag_of_the_Philippines.svg). Its geometry is rendered inline behind the portrait, with three five-pointed stars outside the frame and a foreground hand crossing its edge. The paper texture integrates the sun and frame into one surface. The sun turns 45 degrees over six seconds; its eight identical ray groups make the loop seamless while preserving a slow, constant rotation. The portrait lift is periodic on the same 180-frame cycle.

Keep the video, poster and icons together below Apple's documented 10 MB associated-resource budget. Check both exports after changing the composition, and version filenames when replacing published assets to reduce stale preview caches.
