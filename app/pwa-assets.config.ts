// Generates PWA icons from public/icon.svg: `npm run icons -w app`.
// Output PNGs/ICO are committed, so CI doesn't need sharp.
import { defineConfig, minimal2023Preset as preset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset,
  images: ["public/icon.svg"],
});
