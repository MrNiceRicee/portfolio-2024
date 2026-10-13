import { defineConfig, passthroughImageService } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
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
