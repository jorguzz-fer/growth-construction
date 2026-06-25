import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem Docker mínima para deploy no Coolify (ver docs/STACK.md §4)
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
