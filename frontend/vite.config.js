import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // App instalable en el móvil (icono en la pantalla de inicio, pantalla completa).
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icono.svg"],
      manifest: {
        name: "Registro de obrador",
        short_name: "Obrador",
        description: "Trazabilidad y registros del obrador",
        lang: "es",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#EEF1F0",
        theme_color: "#1E4E8C",
        icons: [
          { src: "icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icono-mascara.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        // La API nunca se sirve de caché: los datos siempre son los del servidor.
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        // Solo las letras latinas de las tipografías (el resto de alfabetos no se usa).
        globIgnores: ["**/*{cyrillic,greek,vietnamese}*.woff2"],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
});
