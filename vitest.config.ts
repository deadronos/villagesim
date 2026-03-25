import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "workers/**/*.{ts,tsx}"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "convex/**",
        "next-env.d.ts",
        "workers/tick.ts",
      ],
    },
    exclude: ["**/node_modules/**", "**/.next/**", "**/coverage/**", "**/dist/**", "convex/_generated/**"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    restoreMocks: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});