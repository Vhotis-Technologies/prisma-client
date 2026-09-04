import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** SPA public path. Override with VITE_BASE (default `/`). */
const base = process.env.VITE_BASE || "/";

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 5173,
    strictPort: false,
  },
});

