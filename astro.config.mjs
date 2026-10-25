import { defineConfig, passthroughImageService } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://www.joshsantos.me",
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  // retain meaningful spaces between adjacent inline elements.
  compressHTML: true,
  image: {
    service: passthroughImageService(),
  },
});
