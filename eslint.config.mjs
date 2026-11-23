import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // CLAUDE.md: sin `any`; usar `unknown` + zod.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // El motor de agentes y el wrapper LLM no dependen de React ni de Next:
    // se testean con Vitest y se ejecutan desde la CLI.
    files: ["src/lib/agents/**", "src/lib/llm/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react/*"], message: "src/lib/agents y src/lib/llm no importan React." },
            { group: ["next", "next/*", "server-only"], message: "src/lib/agents y src/lib/llm no importan Next." },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // La web semilla es HTML/CSS/JS plano que se copia al workspace del run.
    "src/seed/site/**",
  ]),
]);

export default eslintConfig;
