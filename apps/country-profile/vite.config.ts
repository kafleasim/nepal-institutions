import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Sub-path hosting (GitHub Pages serves at /<repo>/). Local dev keeps "/".
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    allowedHosts: [".ngrok-free.app", ".ngrok.app", ".ngrok.io"],
  },
});
