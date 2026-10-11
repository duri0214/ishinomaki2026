import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ローカルのDB（PGlite）はNode.jsのネイティブ読み込みを使うのでバンドルしない
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
