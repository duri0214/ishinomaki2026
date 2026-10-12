"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BASE_NAMES, baseAsset } from "@/features/map/assets";
import { createIslandAction } from "./dev-actions";

export function CreateIslandForm() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [base, setBase] = useState<string>(BASE_NAMES[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await createIslandAction({
        slug,
        name,
        description,
        base,
      });
      if (result.ok) {
        router.push(`/dev/islands/${result.data.slug}`);
      } else {
        setError(result.message);
      }
    } catch {
      setError("作成できませんでした");
    } finally {
      setPending(false);
    }
  };

  const field = "w-full rounded border border-slate-300 px-2 py-1 text-sm";
  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-2">
      <label className="text-sm">
        slug（URLに使う英小文字・数字・ハイフン）
        <input
          className={field}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="hoshizora"
          required
        />
      </label>
      <label className="text-sm">
        名前
        <input
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="星空シアター島"
          required
        />
      </label>
      <label className="text-sm">
        説明（任意）
        <input
          className={field}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <fieldset className="text-sm">
        <legend>島の土台（マップの絵）</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {BASE_NAMES.map((b) => (
            <label
              key={b}
              className={`flex cursor-pointer flex-col items-center rounded border-2 p-1 text-xs ${base === b ? "border-sky-500 bg-sky-50" : "border-transparent hover:border-slate-300"}`}
            >
              <input
                type="radio"
                name="base"
                value={b}
                checked={base === b}
                onChange={() => setBase(b)}
                className="sr-only"
              />
              {/* biome-ignore lint/performance/noImgElement: 開発用エディタの小さな見本なので next/image は使わない */}
              <img
                src={baseAsset(b).src}
                alt=""
                width={72}
                height={72}
                className="size-18 object-contain"
              />
              {b}
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-sky-600 px-4 py-1 text-sm font-bold text-white hover:bg-sky-700 disabled:bg-slate-300"
      >
        {pending ? "作成中…" : "作成"}
      </button>
    </form>
  );
}
