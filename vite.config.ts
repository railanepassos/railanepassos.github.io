import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "p/a8f3k2",
    emptyOutDir: false,
    rollupOptions: {
      input: "src/links/main.ts",
      output: {
        entryFileNames: "app.js",
        format: "iife",
        name: "LinksApp",
      },
    },
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL ?? ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY ?? ""),
  },
});
