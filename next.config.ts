import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // La web semilla se lee del disco al crear un run: hay que incluirla en la
  // traza de la función serverless en Vercel.
  outputFileTracingIncludes: {
    "/api/runs": ["./src/seed/site/**/*"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
