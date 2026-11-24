import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // keep three.js in its own long-cached chunk (it is only loaded by the 3D screens)
        manualChunks: (id) => (id.includes("node_modules/three/") ? "three" : undefined),
      },
    },
    chunkSizeWarningLimit: 700,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
