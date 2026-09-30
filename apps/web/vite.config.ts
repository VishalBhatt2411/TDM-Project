import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "TDM Studio — Test Drive Management",
        short_name: "TDM Studio",
        description: "Book and manage vehicle test drives with your local dealership.",
        theme_color: "#863bff",
        background_color: "#0a0a0a",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        // Only the customer-facing catalog is safe to serve stale-while-offline; booking
        // mutations, auth, and the entire admin console must always hit the network.
        // Top-level navigations to /api (Salesforce OAuth login/callback redirects, asset
        // links) must reach the server — never be answered with the cached SPA shell.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Slot availability is live booking state — a stale copy lets customers pick taken slots.
            urlPattern: ({ url, request }) =>
              request.method === "GET" &&
              !url.pathname.endsWith("/availability") &&
              (url.pathname.startsWith("/api/v1/vehicles") || url.pathname.startsWith("/api/v1/branches")),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "tdm-catalog", expiration: { maxEntries: 100, maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Bundle the shared contracts from source (ESM) — the package's dist build is CommonJS for the API.
      "@tdm/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        // Keep the browser's Host (e.g. acme.localhost:5173) — the API resolves the tenant from it.
        changeOrigin: false,
      },
    },
  },
});
