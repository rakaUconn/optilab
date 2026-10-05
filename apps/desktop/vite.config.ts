import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, fs: { allow: [resolve(__dirname, "../..")] } },
  build: { target: "es2021", chunkSizeWarningLimit: 2500 },
});
