import Link from "next/link";
import { AccountButton } from "@/features/auth/AccountButton";
import { ToolbarIslands } from "./ToolbarIslands";

/** 左端のツールバー（狭い画面では上端の横並び）。世界へ戻る・島の切り替え・アカウント */
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
        <AccountButton />
      </div>
    </header>
  );
}
