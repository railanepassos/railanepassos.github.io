import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // If the var is set in the process environment (even to ""), use it — so CI
  // secrets and intentional empty builds win. Otherwise load from `.env`.
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = (
    "VITE_SUPABASE_URL" in process.env
      ? process.env.VITE_SUPABASE_URL
      : fileEnv.VITE_SUPABASE_URL
  )?.trim() ?? "";
  const supabaseAnonKey = (
    "VITE_SUPABASE_ANON_KEY" in process.env
      ? process.env.VITE_SUPABASE_ANON_KEY
      : fileEnv.VITE_SUPABASE_ANON_KEY
  )?.trim() ?? "";

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
