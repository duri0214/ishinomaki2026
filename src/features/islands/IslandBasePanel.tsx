"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BASE_NAMES, baseAsset, levelImage } from "@/features/map/assets";
import { LEVEL_THRESHOLDS } from "@/features/map/layout";
import { createTopicTagAction, setIslandBaseAction } from "./dev-actions";

/**
 * 島エディタの追加パネル: 島の土台（マップの絵）を選ぶ・家（話題タグ）を新しく建てる。
 * どちらも保存するとすぐ世界地図と島ビューに反映される。
 */
export function IslandBasePanel({
  slug,
  base,
}: {
  slug: string;
  /** いまの土台（base-01 など） */
  base: string | undefined;
}) {
  const router = useRouter();
  const [tagName, setTagName] = useState("");
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setPending(true);
    setMessage(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setMessage({
          text: result.message ?? "保存できませんでした",
          error: true,
        });
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setMessage({ text: "保存できませんでした", error: true });
      return false;
    } finally {
      setPending(false);
    }
  };

  const chooseBase = (name: string) =>
    run(() => setIslandBaseAction(slug, name));

  const addHouse = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = tagName;
    const ok = await run(() => createTopicTagAction(slug, name));
    if (ok) {
      setTagName("");
      setMessage({
        text: `#${name.replace(/^[#＃]/, "")} の家を建てました`,
        error: false,
      });
    }
  };

  return (
    <section className="mt-4 rounded border border-slate-200 p-3">
      <h2 className="text-sm font-bold">島の土台（マップの絵）</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {BASE_NAMES.map((name) => {
          const selected = name === base;
          return (
            <button
              key={name}
              type="button"
              disabled={pending}
              onClick={() => chooseBase(name)}
              aria-pressed={selected}
              className={`flex flex-col items-center rounded border-2 p-1 text-xs ${selected ? "border-sky-500 bg-sky-50" : "border-transparent hover:border-slate-300"}`}
            >
              {/* biome-ignore lint/performance/noImgElement: 開発用エディタの小さな見本なので next/image は使わない */}
              <img
                src={baseAsset(name).src}
                alt=""
                width={96}
                height={96}
                className="size-24 object-contain"
              />
              {name}
            </button>
          );
        })}
      </div>

      <h2 className="mt-4 text-sm font-bold">レベルの絵（見本）</h2>
      <p className="text-xs text-slate-500">
        マップでは、島をフォローしている人数（DB）でレベルが決まります。ここでは全部のレベルを見比べられます。
      </p>
      {(["kawaii", "cool"] as const).map((mode) => (
        <div key={mode} className="mt-2">
          <p className="text-xs font-bold text-slate-600">
            {mode === "kawaii" ? "かわいい" : "かっこいい"}
          </p>
          <div className="flex flex-wrap gap-2">
            {LEVEL_THRESHOLDS.map((min, i) => {
              const level = i + 1;
              const src =
                level === 1
                  ? baseAsset(base, mode).src
                  : levelImage(base, mode, level);
              return (
                <figure key={level} className="flex flex-col items-center">
                  {src ? (
                    // biome-ignore lint/performance/noImgElement: 開発用エディタの小さな見本なので next/image は使わない
                    <img
                      src={src}
                      alt={`レベル${level}`}
                      width={88}
                      height={88}
                      className="size-22 object-contain"
                    />
                  ) : (
                    <span className="flex size-22 items-center justify-center text-xs text-slate-400">
                      絵なし
                    </span>
                  )}
                  <figcaption className="text-[11px] text-slate-500">
                    Lv.{level}（{min.toLocaleString("ja-JP")}人〜）
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      ))}

      <h2 className="mt-4 text-sm font-bold">家（話題タグ）を建てる</h2>
      <p className="text-xs text-slate-500">
        島の家は「直近7日の投稿数の上位10件」です。10件に満たないときは、新しく建てた家が出ます。
      </p>
      <form onSubmit={addHouse} className="mt-2 flex gap-2">
        <input
          value={tagName}
          onChange={(e) => setTagName(e.target.value)}
          placeholder="#ライブ"
          aria-label="新しい家のタグ名"
          required
          className="w-48 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-sky-600 px-4 py-1 text-sm font-bold text-white hover:bg-sky-700 disabled:bg-slate-300"
        >
          建てる
        </button>
      </form>
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`mt-2 text-sm ${message.error ? "text-rose-600" : "text-emerald-700"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
