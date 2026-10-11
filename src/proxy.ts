import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { isClerkConfigured } from "@/lib/env";

const clerk = clerkMiddleware();

/**
 * Clerk のキーが揃っているときだけ Clerk のミドルウェアを通す。
 * 未設定でも閲覧はできるようにするため（clerkMiddleware はキーがないとエラーになる）。
 * ルートの保護はここでは行わず、各 Server Action / Route Handler の中で認証を確認する。
 */
export default function proxy(
  request: NextRequest,
  event: Parameters<typeof clerk>[1],
) {
  if (!isClerkConfigured()) return NextResponse.next();
  return clerk(request, event);
}

export const config = {
  matcher: [
    // Next.js の内部ファイルと静的ファイルは除く
    "/((?!_next|[^?]*.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
