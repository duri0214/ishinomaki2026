import Link from "next/link";
import { AccountButton } from "@/features/auth/AccountButton";
import { DesignSwitch } from "@/features/design/DesignSwitch";
import { AdminLink } from "./AdminLink";
import { ToolbarIslands } from "./ToolbarIslands";

/** 左端のツールバー（狭い画面では上端の横並び）。世界へ戻る・島の切り替え・デザイン・アカウント */
export function Toolbar({
  islands,
}: {
  islands: { slug: string; name: string }[];
}) {
  return (
    <header className="design-toolbar flex min-[551px]:col-span-2 shrink-0 items-center gap-2 bg-[var(--ui-rail)] px-3 py-2 lg:col-span-1 lg:flex-col lg:px-0 lg:py-4">
      <Link
        href="/"
        aria-label="世界地図へ"
        title="世界地図へ"
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--ui-rail-button)] text-2xl hover:bg-[var(--ui-rail-hover)]"
      >
        <span aria-hidden>🏝</span>
      </Link>
      <span aria-hidden className="h-6 w-px bg-white/15 lg:h-px lg:w-8" />
      <ToolbarIslands islands={islands} />
      <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0 lg:mt-auto lg:flex-col">
        <AdminLink />
        <DesignSwitch />
        <AccountButton />
      </div>
    </header>
  );
}
