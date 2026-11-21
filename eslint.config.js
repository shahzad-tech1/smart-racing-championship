// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "experiments-output/**"],
  },
  ...tseslint.configs.recommended,
  {
    // Determinism guard: the sim must not read ambient randomness or wall-clock
    // time. (The *test-based* guards in tests/guards also enforce this and are
    // the authoritative check; this rule gives fast editor feedback.)
    files: ["src/algorithms/**/*.ts", "src/engine/**/*.ts", "src/core/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded RNG from src/core/rng.ts — no ambient randomness in the sim/algorithms." },
        { object: "Date", property: "now", message: "No wall-clock time in the sim/algorithms; drive time from the fixed-step engine clock." },
      ],
      "no-restricted-globals": [
        "error",
        { name: "performance", message: "No wall-clock time in the sim/algorithms (only in the experiment harness/renderer)." },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
