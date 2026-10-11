"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
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
        className="w-36 rounded-full border border-[#e3d9ec] bg-white px-3 py-1 text-sm text-[#3f3158] outline-none placeholder:text-[#b3a8c4] focus:border-[#8e6bb0] disabled:bg-[#f6f1f8] xl:w-48"
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
          className="absolute right-0 z-30 mt-1 max-h-60 w-60 overflow-auto rounded-lg border border-[#ece4ef] bg-white py-1 text-sm shadow-lg"
        >
          {items.map((item, i) => (
            <li key={item.normalizedName}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-[#f6f0fa] ${
                  i === highlight ? "bg-[#f6f0fa]" : ""
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
