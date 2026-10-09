import { defineConfig } from 'astro/config';
import cloudflare from "@astrojs/cloudflare";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";

import playformCompress from "@playform/compress";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    platformProxy: {
      enabled: true
    }
  }),
  integrations: [tailwind(), react(), 
    playformCompress({
      // the public png icons already contain this integration's optimized output.
      // when replacing icons, enable Image for one build and copy their dist output to public.
      // compare decoded pixels with that build before restoring Image: false.
      Image: false
    })
  ]
});
