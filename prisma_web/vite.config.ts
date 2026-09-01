import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Staging nginx serves the SPA at /app/. Local dev stays at /. */
const base = process.env.VITE_BASE || "/";

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 5173,
    strictPort: false,
  },
});

