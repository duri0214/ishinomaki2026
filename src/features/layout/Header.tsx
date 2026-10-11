import { Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Breadcrumb } from "@/features/map/Breadcrumb";
import { TagSearch } from "@/features/tags/TagSearch";
import { isClerkConfigured } from "@/lib/env";

function AuthControls() {
  if (!isClerkConfigured()) {
    return (
      <span
        className="text-xs text-slate-500"
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
          className="rounded-full bg-sky-600 px-3 py-1 text-sm font-bold text-white hover:bg-sky-700"
        >
          ログイン
        </Link>
      </Show>
    </>
  );
}

export function Header({
  islands,
}: {
  islands: { slug: string; name: string }[];
}) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2">
      <Link href="/" className="shrink-0 text-base font-extrabold">
        🏝 島マップ
      </Link>
      <div className="min-w-0 flex-1">
        <Breadcrumb islands={islands} />
      </div>
      <TagSearch />
      <AuthControls />
    </header>
  );
}
