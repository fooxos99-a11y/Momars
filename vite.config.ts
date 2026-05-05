import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("react-router-dom") || id.includes("react-dom") || id.includes("react/")) {
            return "react";
          }

          if (id.includes("@radix-ui")) {
            return "radix";
          }

          if (id.includes("lucide-react")) {
            return "icons";
          }

          if (id.includes("@dnd-kit")) {
            return "dnd";
          }

          if (id.includes("@tiptap")) {
            return "editor";
          }

          if (id.includes("pdfjs-dist")) {
            return "pdf";
          }

          if (id.includes("recharts")) {
            return "charts";
          }

          if (id.includes("@supabase/supabase-js")) {
            return "supabase";
          }

          if (id.includes("xlsx")) {
            return "xlsx";
          }

          if (id.includes("@hookform") || id.includes("zod")) {
            return "forms";
          }

          return "vendor";
        },
      },
    },
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
