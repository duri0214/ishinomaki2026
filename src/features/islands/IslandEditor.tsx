"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  clampToPlaza,
  defaultMemberPosition,
  ISLAND_RADIUS,
  PLAZA_RADIUS,
} from "@/features/map/layout";
import { MapCanvas } from "@/features/map/MapCanvas";
import type { MapFocus, MapIslandData } from "@/features/map/types";
import { normalizeTagName } from "@/features/tags/normalize";
import type { ActionResult } from "@/lib/action";
import type { SaveIslandInput } from "./admin";
import { MAX_MEMBERS } from "./admin-constants";

type DraftMember = { key: string; name: string; x: number; y: number };
type Point = { x: number; y: number };
type SaveIslandAction = (
  input: SaveIslandInput,
) => Promise<ActionResult<{ slug: string }>>;

const round = (n: number) => Math.round(n);

/** SVG 上のドラッグ。ポインタの位置を SVG の座標へ変換して、対象の位置を更新する */
function useDragInSvg(onDrag: (key: string, p: Point) => void) {
  const svgRef = useRef<SVGSVGElement>(null);
  const active = useRef<{ key: string; dx: number; dy: number } | null>(null);

  const toSvg = (e: React.PointerEvent): Point => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };

  return {
    svgRef,
    handlers: (key: string, origin: Point) => ({
      onPointerDown: (e: React.PointerEvent<SVGElement>) => {
        const p = toSvg(e);
        active.current = { key, dx: origin.x - p.x, dy: origin.y - p.y };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      },
      onPointerMove: (e: React.PointerEvent<SVGElement>) => {
        const a = active.current;
        if (!a || a.key !== key) return;
        const p = toSvg(e);
        onDrag(key, { x: p.x + a.dx, y: p.y + a.dy });
      },
      onPointerUp: (e: React.PointerEvent<SVGElement>) => {
        active.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      },
      onPointerCancel: () => {
        active.current = null;
      },
    }),
  };
}

function WorldPad({
  islands,
  editingId,
  onMove,
  onActivate,
}: {
  islands: MapIslandData[];
  editingId: string;
  onMove: (p: Point) => void;
  onActivate: () => void;
}) {
  const { svgRef, handlers } = useDragInSvg((_, p) =>
    onMove({ x: round(p.x), y: round(p.y) }),
  );
  const pad = ISLAND_RADIUS + 80;
  const xs = islands.map((i) => i.worldX);
  const ys = islands.map((i) => i.worldY);
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  return (
    <svg
      ref={svgRef}
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className="h-48 w-full touch-none rounded-lg border border-slate-300 bg-sky-100"
      aria-label="世界地図上の島の位置（ドラッグで移動）"
      onPointerDownCapture={onActivate}
    >
      {islands.map((i) => {
        const editing = i.id === editingId;
        return (
          <g key={i.id}>
            <circle
              cx={i.worldX}
              cy={i.worldY}
              r={ISLAND_RADIUS}
              fill={editing ? "#a8d98a" : "#d5d9dc"}
              stroke={editing ? "#2b7a2b" : "#9aa3a8"}
              strokeWidth={6}
              className={editing ? "cursor-move" : ""}
              data-testid={editing ? "world-handle" : undefined}
              {...(editing ? handlers(i.id, { x: i.worldX, y: i.worldY }) : {})}
            />
            <text
              x={i.worldX}
              y={i.worldY}
              textAnchor="middle"
              fontSize={48}
              pointerEvents="none"
            >
              {i.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PlazaPad({
  members,
  onMove,
  onActivate,
}: {
  members: DraftMember[];
  onMove: (key: string, p: Point) => void;
  onActivate: () => void;
}) {
  const { svgRef, handlers } = useDragInSvg((key, p) => {
    const c = clampToPlaza(p);
    onMove(key, { x: round(c.x), y: round(c.y) });
  });
  const limit = PLAZA_RADIUS + 20;
  return (
    <svg
      ref={svgRef}
      viewBox={`${-limit} ${-limit} ${limit * 2} ${limit * 2}`}
      className="aspect-square w-full max-w-xs touch-none rounded-lg border border-slate-300 bg-emerald-100"
      aria-label="広場でのメンバーの配置（ドラッグで移動）"
      onPointerDownCapture={onActivate}
    >
      <circle
        r={PLAZA_RADIUS}
        fill="#ecdfb8"
        stroke="#b9a66a"
        strokeWidth={1}
      />
      {members.map((m) => (
        <g key={m.key}>
          <circle
            cx={m.x}
            cy={m.y}
            r={9}
            fill="#e0556b"
            stroke="#fff"
            strokeWidth={2}
            className="cursor-move"
            data-testid={`member-handle-${m.name}`}
            {...handlers(m.key, { x: m.x, y: m.y })}
          />
          <text
            x={m.x}
            y={m.y + 22}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            pointerEvents="none"
          >
            {m.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * 島の編集: 名前・説明、世界地図上の座標、メンバータグの位置をドラッグで調整する。
 * 右側のプレビューは本番と同じ MapCanvas で、保存前の下書きをそのまま映す。
 */
export function IslandEditor({
  island,
  initialDescription,
  allIslands,
  saveAction,
}: {
  island: MapIslandData;
  initialDescription: string;
  allIslands: MapIslandData[];
  saveAction: SaveIslandAction;
}) {
  const router = useRouter();
  const [name, setName] = useState(island.name);
  const [description, setDescription] = useState(initialDescription);
  const [worldX, setWorldX] = useState(island.worldX);
  const [worldY, setWorldY] = useState(island.worldY);
  const [members, setMembers] = useState<DraftMember[]>(() =>
    island.members.map((m, i) => {
      const pos = m.position ?? defaultMemberPosition(i, island.members.length);
      return { key: m.id, name: m.name, x: pos.x, y: pos.y };
    }),
  );
  const [newName, setNewName] = useState("");
  const [mode, setMode] = useState<"world" | "island">("island");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const draft: MapIslandData = useMemo(
    () => ({
      ...island,
      name,
      worldX,
      worldY,
      members: members
        .filter((m) => m.name.trim() !== "")
        .map((m) => ({
          id: m.key,
          name: m.name,
          normalizedName: normalizeTagName(m.name.trim()),
          imageUrl: null,
          position: { x: m.x, y: m.y },
        })),
    }),
    [island, name, worldX, worldY, members],
  );
  const previewIslands = useMemo(
    () => allIslands.map((i) => (i.id === island.id ? draft : i)),
    [allIslands, island.id, draft],
  );
  const previewFocus: MapFocus = useMemo(
    () =>
      mode === "world"
        ? { kind: "world" }
        : { kind: "island", slug: island.slug },
    [mode, island.slug],
  );

  const moveMember = (key: string, p: Point) =>
    setMembers((list) =>
      list.map((m) => (m.key === key ? { ...m, x: p.x, y: p.y } : m)),
    );

  const addMember = () => {
    const n = newName.trim();
    if (!n) return;
    setMembers((list) => [
      ...list,
      { key: `new-${crypto.randomUUID()}`, name: n, x: 0, y: 0 },
    ]);
    setNewName("");
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const result = await saveAction({
        slug: island.slug,
        name,
        description,
        worldX,
        worldY,
        members: members.map((m) => ({ name: m.name, x: m.x, y: m.y })),
      });
      if (result.ok) {
        setStatus({ ok: true, text: "保存しました" });
        router.refresh();
      } else {
        setStatus({ ok: false, text: result.message });
      }
    } catch {
      setStatus({ ok: false, text: "保存できませんでした" });
    } finally {
      setSaving(false);
    }
  };

  const input = "rounded border border-slate-300 px-2 py-1 text-sm";
  const num = `${input} w-20`;

  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <label className="text-sm">
            名前
            <input
              className={`${input} block w-full`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="text-sm">
            説明（空にすると消えます）
            <input
              className={`${input} block w-full`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </section>

        <section>
          <h2 className="font-bold">世界地図での位置</h2>
          <WorldPad
            islands={previewIslands}
            editingId={island.id}
            onMove={(p) => {
              setWorldX(p.x);
              setWorldY(p.y);
            }}
            onActivate={() => setMode("world")}
          />
          <div className="mt-1 flex gap-2 text-sm">
            <label>
              X{" "}
              <input
                type="number"
                className={num}
                value={worldX}
                onChange={(e) => setWorldX(Number(e.target.value))}
              />
            </label>
            <label>
              Y{" "}
              <input
                type="number"
                className={num}
                value={worldY}
                onChange={(e) => setWorldY(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            島同士は半径 {ISLAND_RADIUS} の2倍（{ISLAND_RADIUS * 2}
            ）以上離すと重なりません。
          </p>
        </section>

        <section>
          <h2 className="font-bold">メンバーの家（広場）</h2>
          <PlazaPad
            members={members}
            onMove={moveMember}
            onActivate={() => setMode("island")}
          />
          <ul className="mt-2 flex flex-col gap-1">
            {members.map((m) => (
              <li key={m.key} className="flex items-center gap-2 text-sm">
                <input
                  className={`${input} w-32`}
                  aria-label="メンバー名"
                  value={m.name}
                  onChange={(e) =>
                    setMembers((list) =>
                      list.map((x) =>
                        x.key === m.key ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  type="number"
                  className={num}
                  aria-label={`${m.name}のX`}
                  value={m.x}
                  onChange={(e) =>
                    moveMember(m.key, { x: Number(e.target.value), y: m.y })
                  }
                />
                <input
                  type="number"
                  className={num}
                  aria-label={`${m.name}のY`}
                  value={m.y}
                  onChange={(e) =>
                    moveMember(m.key, { x: m.x, y: Number(e.target.value) })
                  }
                />
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                  onClick={() =>
                    setMembers((list) => list.filter((x) => x.key !== m.key))
                  }
                >
                  外す
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              className={`${input} w-40`}
              placeholder="メンバー名"
              aria-label="追加するメンバー名"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addMember();
                }
              }}
            />
            <button
              type="button"
              onClick={addMember}
              disabled={members.length >= MAX_MEMBERS}
              className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              追加
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            名前を変えると別のタグになります。「外す」と話題タグに戻り、投稿は残ります。
          </p>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-sky-600 px-5 py-1.5 text-sm font-bold text-white hover:bg-sky-700 disabled:bg-slate-300"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          {status && (
            <span
              role={status.ok ? "status" : "alert"}
              className={`text-sm ${status.ok ? "text-emerald-700" : "text-rose-600"}`}
            >
              {status.text}
            </span>
          )}
        </div>
      </div>

      <section className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-bold">プレビュー</h2>
          <button
            type="button"
            aria-pressed={mode === "island"}
            onClick={() => setMode("island")}
            className={`rounded-full px-3 py-0.5 text-sm ${mode === "island" ? "bg-sky-600 text-white" : "border border-slate-300"}`}
          >
            島ビュー
          </button>
          <button
            type="button"
            aria-pressed={mode === "world"}
            onClick={() => setMode("world")}
            className={`rounded-full px-3 py-0.5 text-sm ${mode === "world" ? "bg-sky-600 text-white" : "border border-slate-300"}`}
          >
            世界地図
          </button>
        </div>
        <div className="h-[420px] overflow-hidden rounded-lg border border-slate-300">
          <MapCanvas
            islands={previewIslands}
            focusOverride={previewFocus}
            preview
          />
        </div>
      </section>
    </div>
  );
}
