"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { setMapSearch } from "@/features/map/searchStore";
import { normalizeTagName } from "./normalize";
import { useTagSuggestions } from "./useTagSuggestions";

/** 現在地の行にあるタグ検索。島の中でだけ使える（島ごとにタグが別なので） */
export function TagSearch() {
  const params = useParams<{ island?: string }>();
  const island = params.island;
  const router = useRouter();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const query = normalizeTagName(value.trim().replace(/^[#＃]/, ""));
  const suggestions = useTagSuggestions(island, query, open && value !== "");
  const items = value === "" ? [] : (suggestions.data ?? []);
  // 入力中は、島の家を検索結果に入れ替える（マップ側の useMapSearch）
  useEffect(() => {
    setMapSearch(query);
  }, [query]);

  const go = (normalizedName: string) => {
    if (!island || normalizedName === "") return;
    setOpen(false);
    setValue("");
    router.push(`/i/${island}/t/${encodeURIComponent(normalizedName)}`);
  };

  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        disabled={!island}
        placeholder={island ? "タグを検索" : "島を選んで検索"}
        aria-label="タグを検索"
        className="design-field w-36 px-3 py-1 text-sm outline-none focus:border-[var(--ui-accent)] disabled:bg-[var(--ui-hover)] xl:w-48"
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" && items.length > 0) {
            e.preventDefault();
            setHighlight((h) => (h + 1) % items.length);
          } else if (e.key === "ArrowUp" && items.length > 0) {
            e.preventDefault();
            setHighlight((h) => (h <= 0 ? items.length - 1 : h - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const picked = items[highlight]?.normalizedName;
            // 候補を選んでいなければ、入力した名前のタグページを開く（まだ誰も使っていなくても開ける）
            go(picked ?? query);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && items.length > 0 && (
        <ul
          aria-label="タグの候補"
          className="design-suggestions absolute right-0 z-30 mt-1 max-h-60 w-60 overflow-auto text-sm shadow-lg"
        >
          {items.map((item, i) => (
            <li key={item.normalizedName}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[var(--ui-hover)] ${
                  i === highlight ? "bg-[var(--ui-hover)]" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(item.normalizedName)}
              >
                <span>#{item.name}</span>
                {item.kind === "member" && (
                  <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">
                    メンバー
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
