import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react({ tsDecorators: true })],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "apps/api/src/**/*.{test,spec}.{ts,tsx}",
      "packages/contracts/src/**/*.{test,spec}.{ts,tsx}",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@flcbi/contracts": path.resolve(__dirname, "./packages/contracts/src/index.ts"),
    },
  },
});
