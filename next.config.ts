import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 既定の左下はツールバーのアカウントボタンと重なるので、集合写真の上（右上）に出す
  devIndicators: { position: "top-right" },
  // ローカルのDB（PGlite）はNode.jsのネイティブ読み込みを使うのでバンドルしない
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
