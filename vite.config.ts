import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const bffTarget = process.env.VITE_BFF_URL ?? "http://localhost:8084";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    proxy: {
      "/bff": { target: bffTarget, changeOrigin: true },
      "/internal": { target: bffTarget, changeOrigin: true },
    },
  },
});
