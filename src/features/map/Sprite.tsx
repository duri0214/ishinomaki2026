import type { SpriteAsset } from "./assets";

/**
 * 素材画像を1枚、接地点 (x, y) に立たせて描く。足元にやわらかい影を付ける。
 * width はマップ座標での横幅。高さは画像の縦横比から決める。
 */
export function Sprite({
  asset,
  x,
  y,
  width,
  shadow = true,
  interactive = false,
}: {
  asset: SpriteAsset;
  x: number;
  y: number;
  width: number;
  shadow?: boolean;
  /** false なら、クリックは下にある島へ通す */
  interactive?: boolean;
}) {
  const height = (width * asset.height) / asset.width;
  const [ax = 0.5, ay = 1] = asset.anchor;
  return (
    <g
      transform={`translate(${x} ${y})`}
      pointerEvents={interactive ? undefined : "none"}
    >
      {shadow && (
        <ellipse
          cx={0}
          cy={-width * 0.04}
          rx={width * 0.42}
          ry={width * 0.12}
          fill="rgba(40, 24, 60, 0.22)"
        />
      )}
      <image
        href={asset.src}
        x={-ax * width}
        y={-ay * height}
        width={width}
        height={height}
      />
    </g>
  );
}
