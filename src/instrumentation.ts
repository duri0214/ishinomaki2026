/** 本番サーバーの起動時に環境変数を検証し、足りなければ起動を止める */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@/lib/env");
    getEnv();
  }
}
