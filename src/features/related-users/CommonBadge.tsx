import type { CommonKind, CommonPoint } from "./rank";

/** 共通点を「◯◯を推しています」のような一文にする */
export function describeCommon(point: CommonPoint): string {
  switch (point.kind) {
    case "member":
    case "island":
      return `${point.label}を推しています`;
    case "live":
      // デモの公演名は全グループで同じなので、グループ名を添えて区別する
      return `${point.label}（${point.islandName}）に参戦しています`;
  }
}

const KINDS: Record<
  CommonKind,
  { icon: string; kindName: string; className: string }
> = {
  member: {
    icon: "♥",
    kindName: "推しメンバー",
    className:
      "border-transparent bg-[var(--ui-selected)] text-[var(--ui-selected-text)]",
  },
  live: {
    icon: "♪",
    kindName: "ライブ",
    className: "border-transparent bg-[var(--ui-hover)] text-[var(--ui-title)]",
  },
  island: {
    icon: "★",
    kindName: "推しグループ",
    className: "border-[var(--ui-border)] text-[var(--ui-text)]",
  },
};

/** 共通点の小さなバッジ。種類ごとに色と記号を変える（優先順位が高いほど目立つ） */
export function CommonBadge({ point }: { point: CommonPoint }) {
  const { icon, kindName, className } = KINDS[point.kind];
  const text = describeCommon(point);
  return (
    <span
      data-kind={point.kind}
      title={`${kindName}: ${text}`}
      className={`inline-flex max-w-full items-start gap-1 rounded-[var(--ui-radius-inner)] border px-2 py-0.5 text-[11px] font-bold leading-snug ${className}`}
    >
      <span aria-hidden>{icon}</span>
      {/* 長い公演名は折り返す。日本語は文節の切れ目で折り返し、「ます」だけが次の行に残らないようにする */}
      <span className="min-w-0 break-words [word-break:auto-phrase]">
        {text}
      </span>
    </span>
  );
}
