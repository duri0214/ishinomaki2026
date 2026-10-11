"use client";

import { interpolateZoom } from "d3-interpolate";
import { select } from "d3-selection";
import { type ZoomBehavior, zoom, zoomIdentity, zoomTransform } from "d3-zoom";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cameraFor, focusForPath, focusKey, resolveFocus } from "./layout";
import { MapScene } from "./MapScene";
import type { Camera, MapFocus, MapIslandData, Viewport } from "./types";

const ANIMATION_MS = 650;
const REFRESH_MS = 5 * 60 * 1000;
/** 画面サイズを測る前（サーバー描画時を含む）に仮に使う大きさ */
const DEFAULT_VIEW: Viewport = { width: 1000, height: 480 };

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/**
 * 常駐する島マップ。(main)/layout.tsx に置くので、ページを移動しても作り直されない。
 * URL（島・タグ）から目標のカメラ位置を求め、約650msかけて滑らかに移動する。
 * d3 は d3-zoom（パン・ズームの入力処理）と d3-interpolate（移動経路）だけに使い、
 * DOM の描画は React が行う。
 */
export function MapCanvas({
  islands,
  focusOverride,
  preview = false,
}: {
  islands: MapIslandData[];
  /** URL の代わりに、見せる場所を指定する（島エディタのプレビュー用） */
  focusOverride?: MapFocus;
  /** true なら、家や島をクリックしてもページ移動せず、定期的な再取得もしない（島エディタのプレビュー用） */
  preview?: boolean;
}) {
  const params = useParams<{ island?: string; tag?: string }>();
  const router = useRouter();

  const paramIsland = params.island;
  const paramTag = params.tag;
  const focus = useMemo(
    () =>
      focusOverride ??
      resolveFocus(islands, { island: paramIsland, tag: paramTag }),
    [islands, paramIsland, paramTag, focusOverride],
  );
  const key = focusKey(focus);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const behaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const frameRef = useRef<number | null>(null);
  const viewRef = useRef<Viewport>(DEFAULT_VIEW);
  const prefetchedRef = useRef(new Set<string>());
  const lastKeyRef = useRef<string | null>(null);
  const lastViewRef = useRef<Viewport | null>(null);
  /** クリックで先にズームを始めたときの行き先。URLが変わったときに二重に動かさないため */
  const pendingKeyRef = useRef<string | null>(null);

  const [view, setView] = useState<Viewport>(DEFAULT_VIEW);
  const [camera, setCamera] = useState<Camera>(() =>
    cameraFor(focus, islands, DEFAULT_VIEW),
  );

  const cancelAnimation = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  /** d3-zoom の状態とカメラを目標へ合わせる。immediate でなければ滑らかに動かす */
  const animateTo = useCallback(
    (target: Camera, immediate: boolean) => {
      const svg = svgRef.current;
      const behavior = behaviorRef.current;
      if (!svg || !behavior) return;
      cancelAnimation();
      const selection = select(svg);
      const apply = (c: Camera) =>
        behavior.transform(
          selection,
          zoomIdentity.translate(c.x, c.y).scale(c.k),
        );

      const current = zoomTransform(svg);
      const { width, height } = viewRef.current;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const unchanged =
        Math.abs(current.x - target.x) < 0.5 &&
        Math.abs(current.y - target.y) < 0.5 &&
        Math.abs(current.k - target.k) < 0.0005;
      if (immediate || reduceMotion || unchanged) {
        apply(target);
        return;
      }

      // 画面中心の世界座標と、見えている幅で表した「ビュー」を、滑らかな経路で補間する
      const toView = (c: Camera): [number, number, number] => [
        (width / 2 - c.x) / c.k,
        (height / 2 - c.y) / c.k,
        width / c.k,
      ];
      const path = interpolateZoom(
        toView({ x: current.x, y: current.y, k: current.k }),
        toView(target),
      );
      const startedAt = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - startedAt) / ANIMATION_MS);
        const [cx, cy, w] = path(easeInOutCubic(t));
        const k = width / w;
        apply({ x: width / 2 - cx * k, y: height / 2 - cy * k, k });
        frameRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      frameRef.current = requestAnimationFrame(step);
    },
    [cancelAnimation],
  );

  // d3-zoom を svg に取り付ける（入力の処理だけ。描画は React）
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 12])
      .on("start", (event) => {
        // ユーザーの操作（ホイール・ドラッグ・ピンチ）が始まったら、自動の移動を止める
        if (event.sourceEvent) cancelAnimation();
      })
      .on("zoom", (event) => {
        const { x, y, k } = event.transform;
        setCamera({ x, y, k });
      });
    behaviorRef.current = behavior;
    select(svg).call(behavior).on("dblclick.zoom", null);
    return () => {
      cancelAnimation();
      select(svg).on(".zoom", null);
      behaviorRef.current = null;
    };
  }, [cancelAnimation]);

  // 画面サイズを測る
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const next = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      if (next.width > 0 && next.height > 0) {
        viewRef.current = next;
        setView((prev) =>
          prev.width === next.width && prev.height === next.height
            ? prev
            : next,
        );
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // URL（島・タグ）か画面サイズが変わったら、目標の位置へ動かす
  useLayoutEffect(() => {
    const first = lastKeyRef.current === null;
    const keyChanged = lastKeyRef.current !== key;
    const prevView = lastViewRef.current;
    const viewChanged =
      !prevView ||
      prevView.width !== view.width ||
      prevView.height !== view.height;
    lastKeyRef.current = key;
    lastViewRef.current = view;
    if (!first && !keyChanged && !viewChanged) return;

    const pending = pendingKeyRef.current;
    pendingKeyRef.current = null;
    // クリックで既に同じ行き先へ動き始めているなら、そのまま続ける
    if (!first && !viewChanged && pending === key) return;

    animateTo(cameraFor(focus, islands, view), first || viewChanged);
  }, [key, view, focus, islands, animateTo]);

  const onNavigate = useCallback(
    (href: string) => {
      if (preview) return;
      // ルートの解決を待たずに、先にズームを始める
      const destination = focusForPath(islands, href);
      const destinationKey = focusKey(destination);
      if (destinationKey !== lastKeyRef.current) {
        pendingKeyRef.current = destinationKey;
        animateTo(cameraFor(destination, islands, viewRef.current), false);
      }
      router.push(href, { scroll: false });
    },
    [islands, animateTo, router, preview],
  );

  const onHover = useCallback(
    (href: string) => {
      if (preview || prefetchedRef.current.has(href)) return;
      prefetchedRef.current.add(href);
      router.prefetch(href);
    },
    [router, preview],
  );

  // ランキング（5分キャッシュ）の更新を取り込む。順位が変わった家はスロットへ移動する
  useEffect(() => {
    if (preview) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router, preview]);

  const zoomBy = (factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const { width, height } = viewRef.current;
    const c = zoomTransform(svg);
    const k = Math.min(12, Math.max(0.05, c.k * factor));
    // 画面中心を保ったまま拡大・縮小する
    const cx = (width / 2 - c.x) / c.k;
    const cy = (height / 2 - c.y) / c.k;
    animateTo({ x: width / 2 - cx * k, y: height / 2 - cy * k, k }, false);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-sea"
      data-testid="map"
      data-focus={key}
    >
      <svg
        ref={svgRef}
        className="size-full touch-none select-none"
        aria-labelledby="map-title"
      >
        <title id="map-title">
          島マップ（ドラッグで移動、ホイールで拡大・縮小できます）
        </title>
        <defs>
          <pattern
            id="waves"
            width="90"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 20 Q22.5 8 45 20 T90 20"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.45"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#waves)" />
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
          <MapScene
            islands={islands}
            focus={focus}
            onNavigate={onNavigate}
            onHover={onHover}
          />
        </g>
      </svg>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button
          type="button"
          aria-label="拡大"
          onClick={() => zoomBy(1.6)}
          className="size-8 rounded-md bg-white/90 text-lg shadow hover:bg-white"
        >
          ＋
        </button>
        <button
          type="button"
          aria-label="縮小"
          onClick={() => zoomBy(1 / 1.6)}
          className="size-8 rounded-md bg-white/90 text-lg shadow hover:bg-white"
        >
          －
        </button>
        <button
          type="button"
          aria-label="元の位置に戻す"
          onClick={() =>
            animateTo(cameraFor(focus, islands, viewRef.current), false)
          }
          className="size-8 rounded-md bg-white/90 text-sm shadow hover:bg-white"
        >
          ⌖
        </button>
      </div>
    </div>
  );
}
