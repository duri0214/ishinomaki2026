import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 画面の隅にあるアカウント・プロフィールのボタンを開発用バッジで覆わない。
  devIndicators: false,
  // 開発中のサーバーを止めずに、E2E・ビルド検証を別の出力先で実行できるようにする。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // ローカルのDB（PGlite）はNode.jsのネイティブ読み込みを使うのでバンドルしない
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
