"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActionResult } from "@/lib/action";
import type { CreateTopicsInput, SaveTopicInput } from "./admin";

type Topic = { id: string; name: string };
type SaveTopicAction = (
  input: SaveTopicInput,
) => Promise<ActionResult<{ id: string }>>;
type CreateTopicsAction = (
  input: CreateTopicsInput,
) => Promise<ActionResult<{ topics: Topic[] }>>;

export function TopicEditor({
  islandSlug,
  initialTopics,
  saveAction,
  createAction,
}: {
  islandSlug: string;
  initialTopics: Topic[];
  saveAction: SaveTopicAction;
  createAction: CreateTopicsAction;
}) {
  const router = useRouter();
  const [topics, setTopics] = useState(initialTopics);
  const [newNames, setNewNames] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const save = async (id: string, name: string) => {
    setPendingId(id);
    setMessage(null);
    try {
      const result = await saveAction({ islandSlug, id, name });
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setMessage({ ok: true, text: "話題タグを保存しました" });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "保存できませんでした" });
    } finally {
      setPendingId(null);
    }
  };

  const addTopics = async () => {
    const names = newNames.split(/\s+/).filter(Boolean);
    setPendingId("new");
    setMessage(null);
    try {
      const result = await createAction({ islandSlug, names });
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setTopics((current) => {
        const next = new Map(current.map((topic) => [topic.id, topic]));
        for (const topic of result.data.topics) next.set(topic.id, topic);
        return [...next.values()];
      });
      setNewNames("");
      setMessage({
        ok: true,
        text: `${result.data.topics.length}件の話題タグを追加しました`,
      });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "保存できませんでした" });
    } finally {
      setPendingId(null);
    }
  };

  const field = "rounded border border-slate-300 px-2 py-1 text-sm";
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold">話題タグ</h2>
      <p className="mt-1 text-sm text-slate-600">
        話題タグは投稿に付けるタグです。メンバータグと同じ tags
        データを使い、kind が topic のものをここで整備します。
      </p>
      {topics.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          話題タグはまだありません。
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {topics.map((topic) => (
            <li key={topic.id} className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`${topic.name} の話題タグ名`}
                className={`${field} min-w-48 flex-1`}
                value={topic.name}
                onChange={(event) =>
                  setTopics((current) =>
                    current.map((item) =>
                      item.id === topic.id
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() => save(topic.id, topic.name)}
                disabled={pendingId !== null}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                保存
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <textarea
          aria-label="追加する話題タグ名（スペース・改行で区切る）"
          className={`${field} min-h-20 min-w-48 flex-1`}
          value={newNames}
          onChange={(event) => setNewNames(event.target.value)}
          placeholder="例: ライブ 新曲 ツアー"
        />
        <button
          type="button"
          onClick={addTopics}
          disabled={pendingId !== null || newNames.trim() === ""}
          className="rounded-full bg-sky-600 px-4 py-1 text-sm font-bold text-white hover:bg-sky-700 disabled:bg-slate-300"
        >
          話題タグを追加
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        複数の話題タグは、スペースまたは改行で区切って入力してください。タグ名そのものにスペースは使えません。
      </p>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mt-3 text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
