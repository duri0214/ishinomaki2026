"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createIslandAction } from "./dev-actions";

export function CreateIslandForm() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await createIslandAction({ slug, name, description });
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
