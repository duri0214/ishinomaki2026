"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/action";
import {
  TRAIT_AXES,
  TRAIT_CATEGORIES,
  TRAIT_MAX,
  TRAIT_MIN,
  type TraitKey,
} from "./constants";
import type { SaveIslandTraitsInput, TraitScores } from "./service";

type SaveTraitsAction = (
  input: SaveIslandTraitsInput,
) => Promise<ActionResult<TraitScores>>;

const STEPS = Array.from(
  { length: TRAIT_MAX - TRAIT_MIN + 1 },
  (_, i) => TRAIT_MIN + i,
);

/** 島の傾向タグ（全軸）を 1〜5 で選んで保存するフォーム。未評価に戻すこともできる */
export function TraitsEditor({
  slug,
  initial,
  saveAction,
}: {
  slug: string;
  initial: TraitScores;
  saveAction: SaveTraitsAction;
}) {
  const [scores, setScores] = useState<TraitScores>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);

  const set = (key: TraitKey, value: number | undefined) => {
    setMessage(null);
    setScores((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const save = async () => {
    setPending(true);
    setMessage(null);
    try {
      // 全軸を送る。選んでいない軸は null（未評価）として保存する
      const payload = Object.fromEntries(
        TRAIT_AXES.map((a) => [a.key, scores[a.key] ?? null]),
      );
      const result = await saveAction({ slug, scores: payload });
      if (result.ok) {
        setScores(result.data);
        setMessage({ ok: true, text: "保存しました" });
      } else {
        setMessage({ ok: false, text: result.message });
      }
    } catch {
      setMessage({ ok: false, text: "保存できませんでした" });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-6">
      {TRAIT_CATEGORIES.map((category) => (
        <section key={category.key}>
          <h2 className="font-bold">{category.label}</h2>
          <div className="mt-2 flex flex-col gap-3">
            {category.axes.map((axis) => (
              <fieldset
                key={axis.key}
                data-testid={`trait-${axis.key}`}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <legend className="px-1 text-sm text-slate-500">
                  {axis.left} ↔ {axis.right}
                </legend>
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-24 text-right">{axis.left}</span>
                  {STEPS.map((step) => (
                    <label
                      key={step}
                      className="flex cursor-pointer flex-col items-center gap-0.5 px-1"
                    >
                      <input
                        type="radio"
                        name={axis.key}
                        checked={scores[axis.key] === step}
                        onChange={() => set(axis.key, step)}
                        aria-label={`${axis.left} ↔ ${axis.right}: ${step}`}
                      />
                      <span className="text-xs text-slate-500">{step}</span>
                    </label>
                  ))}
                  <span className="w-24">{axis.right}</span>
                  <button
                    type="button"
                    onClick={() => set(axis.key, undefined)}
                    disabled={scores[axis.key] === undefined}
                    className="ml-auto text-xs text-slate-500 underline disabled:no-underline disabled:opacity-40"
                  >
                    未評価に戻す
                  </button>
                </div>
              </fieldset>
            ))}
          </div>
        </section>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full bg-sky-600 px-4 py-1 text-sm font-bold text-white hover:bg-sky-700 disabled:bg-slate-300"
        >
          {pending ? "保存中…" : "保存"}
        </button>
        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
