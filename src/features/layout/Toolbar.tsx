import { Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { isClerkConfigured } from "@/lib/env";
import { ToolbarIslands } from "./ToolbarIslands";

function AuthControls() {
  if (!isClerkConfigured()) {
    return (
      <span
        className="px-1 text-center text-[10px] leading-tight text-[#b9aed0]"
        title="Clerk のキーが未設定のため、ログインは無効です"
      >
        閲覧のみ
      </span>
    );
  }
  return (
    <>
      <Show when="signed-in">
        <UserButton />
      </Show>
      <Show when="signed-out">
        <Link
          href="/sign-in"
          className="rounded-full bg-[#fffcf8] px-2.5 py-1 text-[11px] font-bold text-[#3f3158] hover:bg-white lg:px-2"
        >
          ログイン
        </Link>
      </Show>
    </>
  );
}

/** 左端のツールバー（狭い画面では上端の横並び）。世界へ戻る・島の切り替え・ログイン */
export function Toolbar({
  islands,
}: {
  islands: { slug: string; name: string }[];
}) {
  return (
    <header className="flex min-[551px]:col-span-2 shrink-0 items-center gap-2 bg-[#2b2140] px-3 py-2 lg:col-span-1 lg:flex-col lg:px-0 lg:py-4">
      <Link
        href="/"
        aria-label="世界地図へ"
        title="世界地図へ"
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#3d3157] text-2xl hover:bg-[#4a3d68]"
      >
        <span aria-hidden>🏝</span>
      </Link>
      <span aria-hidden className="h-6 w-px bg-white/15 lg:h-px lg:w-8" />
      <ToolbarIslands islands={islands} />
      <div className="ml-auto flex shrink-0 flex-col items-center gap-2 lg:ml-0 lg:mt-auto">
        <AuthControls />
      </div>
    </header>
  );
}
