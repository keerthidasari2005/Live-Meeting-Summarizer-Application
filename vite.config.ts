import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/send-otp": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/api/send-export-email": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        timeout: 21600000,
        proxyTimeout: 21600000,
      },
      "/api/send-notification-email": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        timeout: 21600000,
        proxyTimeout: 21600000,
      },
      "/api/upload": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        timeout: 21600000,
        proxyTimeout: 21600000,
      },
      "/api/summarize": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        timeout: 21600000,
        proxyTimeout: 21600000,
      },
      "/api/process": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        timeout: 21600000,
        proxyTimeout: 21600000,
      },
      "/api/health": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        timeout: 21600000,
        proxyTimeout: 21600000,
      },
      "/api/jobs": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        timeout: 21600000,
        proxyTimeout: 21600000,
      },
      "/api/status": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        timeout: 21600000,
        proxyTimeout: 21600000,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
});
