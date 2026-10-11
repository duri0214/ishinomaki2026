"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteLiveRecordAction, saveLiveRecordAction } from "./actions";
import type { LiveData } from "./service";

const field =
  "w-full rounded-xl border border-[#ece4ef] bg-white p-2 text-sm text-[#3f3158]";
const button =
  "rounded-full bg-[#f6f0fa] px-4 py-2 text-sm font-bold text-[#6a5c7d] disabled:opacity-50";
const date = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));

export function LiveRecords({
  data,
  ownerId,
}: {
  data: LiveData;
  ownerId: string;
}) {
  const router = useRouter();
  const [idol, setIdol] = useState("");
  const [eventId, setEventId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const groups = data.favorites;
  const events = data.events.filter(
    (e) =>
      e.islandSlug === idol && !data.records.some((r) => r.eventId === e.id),
  );
  const records = data.records.filter((r) =>
    data.events.some((e) => e.id === r.eventId),
  );
  function reset() {
    setEventId("");
    setNote("");
  }
  async function mutate() {
    setBusy(true);
    setMessage("");
    try {
      const result = await saveLiveRecordAction({ eventId, note });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      reset();
      setMessage("参戦記録を保存しました");
      router.refresh();
    } catch {
      setMessage("通信に失敗しました。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-4 mb-4 rounded-[28px] border border-[#ece4ef] bg-white p-4 text-[#3f3158]">
      <h2 className="font-serif text-lg font-bold">ライブ参戦記録</h2>
      <p className="mt-1 text-xs text-[#6a5c7d]">
        自分だけの記録です。公演一覧はデモ用の架空のライブです。
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void mutate();
        }}
      >
        <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
          <label className="block text-sm">
            1. フォロー中のアイドル
            <select
              className={field}
              value={idol}
              onChange={(e) => {
                setIdol(e.target.value);
                reset();
              }}
            >
              <option value="">アイドルを選択</option>
              {groups.map((f) => (
                <option key={f.island.slug} value={f.island.slug}>
                  {f.island.name}
                </option>
              ))}
            </select>
          </label>
          {groups.length === 0 && (
            <p className="text-sm">
              プロフィールの「編集」から推しグループを設定すると、ライブを選べます。
            </p>
          )}
          <label className="block text-sm">
            2. ライブを選択
            <select
              className={field}
              required
              disabled={!idol}
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                const record = data.records.find(
                  (r) => r.eventId === e.target.value,
                );
                setNote(record?.note ?? "");
              }}
            >
              <option value="">ライブを選択</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {date(e.startsAt)} · {e.title}
                  {data.records.some((r) => r.eventId === e.id)
                    ? "（記録済み）"
                    : ""}
                </option>
              ))}
            </select>
          </label>
          {idol && events.length === 0 && (
            <p className="text-sm">
              新しく記録できる公演はありません。記録済みの公演は下の一覧から編集できます。
            </p>
          )}
          {eventId && (
            <>
              <label className="block text-sm">
                感想・メモ（任意）
                <textarea
                  className={field}
                  rows={3}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="お気に入りの曲や、その日の思い出を残そう"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className={button} type="submit">
                  {busy ? "保存中…" : "参戦記録を保存"}
                </button>
              </div>
            </>
          )}
        </fieldset>
      </form>
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
      <h3 className="mt-4 text-sm font-bold">
        これまでの参戦 · {records.length}公演
      </h3>
      {records.length === 0 ? (
        <p className="mt-2 text-sm text-[#6a5c7d]">
          参戦記録はまだありません。
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {[
            ...new Set(
              data.events
                .filter((e) => records.some((r) => r.eventId === e.id))
                .map((e) => e.islandSlug),
            ),
          ].map((slug) => {
            const entries = records
              .flatMap((record) => {
                const event = data.events.find(
                  (e) => e.id === record.eventId && e.islandSlug === slug,
                );
                return event ? [{ record, event }] : [];
              })
              .sort(
                (a, b) =>
                  Date.parse(b.event.startsAt) - Date.parse(a.event.startsAt) ||
                  a.event.id.localeCompare(b.event.id),
              );
            return (
              <IdolRecords
                key={slug}
                ownerId={ownerId}
                slug={slug}
                entries={entries}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

const colors = [
  { name: "ラベンダー", value: "#f6f0fa" },
  { name: "ピンク", value: "#fce7ef" },
  { name: "ブルー", value: "#e5f1fc" },
  { name: "ミント", value: "#e4f5eb" },
  { name: "イエロー", value: "#fff4d6" },
  { name: "オレンジ", value: "#ffeadb" },
];

function IdolRecords({
  ownerId,
  slug,
  entries,
}: {
  ownerId: string;
  slug: string;
  entries: {
    record: LiveData["records"][number];
    event: LiveData["events"][number];
  }[];
}) {
  const defaultColor =
    colors[
      [...slug].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
        colors.length
    ]?.value ?? "#f6f0fa";
  const [color, setColor] = useState(defaultColor);
  const storageKey = `live-record-color:${ownerId}:${slug}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setColor(
        colors.some((c) => c.value === saved)
          ? (saved as string)
          : defaultColor,
      );
    } catch {
      setColor(defaultColor);
    }
  }, [storageKey, defaultColor]);
  const name = entries[0]?.event.islandName;
  return (
    <details open className="group rounded-2xl border border-[#ece4ef] p-3">
      <summary className="cursor-pointer text-sm font-bold">
        {name}{" "}
        <span className="ml-1 text-xs font-normal">{entries.length}公演</span>
      </summary>
      <div className="mt-3">
        <label className="flex items-center gap-2 text-xs">
          公演カードの色
          <select
            aria-label={`${name}の公演カードの色`}
            className="rounded-lg border border-[#ece4ef] bg-white p-1"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              try {
                localStorage.setItem(storageKey, e.target.value);
              } catch {
                /* 保存できない場合もこの画面では反映する */
              }
            }}
          >
            {colors.map((c) => (
              <option key={c.value} value={c.value}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <ul aria-label={`${name}の参戦記録`} className="mt-3 space-y-3">
          {entries.map(({ record, event }) => (
            <li
              key={event.id}
              className="rounded-xl p-3"
              style={{ backgroundColor: color }}
            >
              <p className="font-bold">{event.title}</p>
              <p className="text-xs">
                {date(event.startsAt)} · {event.venue}
              </p>
              <RecordEditor record={record} title={event.title} />
            </li>
          ))}
        </ul>
        <Link
          href={`/i/${slug}`}
          className="mt-3 inline-block text-xs underline"
        >
          {name}のページへ
        </Link>
      </div>
    </details>
  );
}

/** 編集状態と保存結果を記録カード内に閉じ込める。 */
function RecordEditor({
  record,
  title,
}: {
  record: LiveData["records"][number];
  title: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(record.note);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function mutate(remove = false) {
    setBusy(true);
    setMessage("");
    try {
      const result = remove
        ? await deleteLiveRecordAction(record.eventId)
        : await saveLiveRecordAction({ eventId: record.eventId, note });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setEditing(false);
      setMessage("変更内容を保存しました");
      router.refresh();
    } catch {
      setMessage("通信に失敗しました。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {editing ? (
        <form
          className="mt-3"
          aria-label={`${title}の記録を編集`}
          onSubmit={(e) => {
            e.preventDefault();
            void mutate();
          }}
        >
          <fieldset disabled={busy} className="space-y-3 disabled:opacity-60">
            <label className="block text-sm">
              感想・メモ（任意）
              <textarea
                className={field}
                rows={3}
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className={button} type="submit">
                {busy ? "保存中…" : "変更内容を保存"}
              </button>
              <button
                className={button}
                type="button"
                onClick={() => {
                  setEditing(false);
                  setMessage("");
                }}
              >
                キャンセル
              </button>
              <button
                className={button}
                type="button"
                onClick={() => {
                  if (window.confirm("この参戦記録を削除しますか？"))
                    void mutate(true);
                }}
              >
                削除
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          {record.note && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">
              {record.note}
            </p>
          )}
          <button
            className={`${button} mt-2`}
            type="button"
            onClick={() => {
              setNote(record.note);
              setEditing(true);
              setMessage("");
            }}
          >
            記録を編集
          </button>
        </>
      )}
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
    </>
  );
}
