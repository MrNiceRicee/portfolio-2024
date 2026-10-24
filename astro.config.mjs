import { defineConfig, passthroughImageService } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://www.joshsantos.me',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
  // preserve spaces between inline elements when upgrading from Astro 4.
  compressHTML: true,
  image: {
    service: passthroughImageService(),
  },
});
