import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // Load `.env`, `.env.local`, `.env.[mode]`, etc. Process env wins (CI secrets).
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL ?? "";
  const supabaseAnonKey =
    process.env.VITE_SUPABASE_ANON_KEY ?? fileEnv.VITE_SUPABASE_ANON_KEY ?? "";

  return {
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
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseAnonKey),
    },
    test: {
      include: ["tests/unit/**/*.test.ts"],
      exclude: ["tests/e2e/**", "node_modules/**"],
      coverage: {
        include: ["src/links/**/*.ts"],
        exclude: ["src/links/main.ts", "src/links/admin-ui.ts", "src/links/render.ts"],
      },
    },
  };
});
