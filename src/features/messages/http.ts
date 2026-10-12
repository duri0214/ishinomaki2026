import "server-only";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";

// エラー応答を含め、ブラウザや共有キャッシュへ保存させない。
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function privateResponse<T>(read: () => Promise<T>) {
  try {
    return NextResponse.json(await read(), { headers });
  } catch (error) {
    if (error instanceof AppError) {
      const status =
        error.code === "unauthorized"
          ? 401
          : error.code === "validation"
            ? 400
            : 404;
      return NextResponse.json({ error: error.message }, { status, headers });
    }
    console.error("DM request failed:", error);
    return NextResponse.json(
      { error: "メッセージを読み込めませんでした" },
      { status: 500, headers },
    );
  }
}
