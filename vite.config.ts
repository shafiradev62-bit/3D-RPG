import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  root: __dirname,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    host: true,
  },
});
