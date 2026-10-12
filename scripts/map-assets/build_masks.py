"""島の土台から、家や木を置ける「草地」のマスクを作る。

使い方:
  py scripts/map-assets/build_masks.py .
出力:
  scripts/map-assets/masks/<base>-mask.png   草地＝緑、それ以外＝透明（Figma で手直しできる）
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

# 草の色の範囲（Pillow の HSV は 0〜255）
HUE = (30, 85)      # 黄緑〜緑
SAT_MIN = 50        # くすんだ色（岩・石畳）を除く
VAL_MIN = 80        # 暗い影を除く
MIN_AREA = 0.005    # 画像全体の 0.5% より小さい草地は捨てる（崖のコケなど）
MARGIN = 10         # 縁から内側へ縮める幅(px)。崖ぎりぎりに置かないため


def lawn_mask(img: Image.Image) -> np.ndarray:
    """草地なら True になる2次元配列を返す"""
    hsv = np.array(img.convert("RGB").convert("HSV")).astype(int)
    alpha = np.array(img.getchannel("A"))
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    grass = (h >= HUE[0]) & (h <= HUE[1]) & (s >= SAT_MIN) & (v >= VAL_MIN) & (alpha > 200)
    grass = ndi.binary_opening(grass, iterations=3)    # 細いコケや点のノイズを消す
    grass = ndi.binary_fill_holes(grass)                # 草地の中の花や小石の穴を埋める
    labels, n = ndi.label(grass)                        # つながった草地ごとに番号を付ける
    sizes = ndi.sum(grass, labels, range(1, n + 1))
    keep = [i + 1 for i, size in enumerate(sizes) if size >= grass.size * MIN_AREA]
    grass = np.isin(labels, keep)                       # 小さい草地を捨てる
    return ndi.binary_erosion(grass, iterations=MARGIN)  # 縁から少し内側へ縮める


def main():
    repo = sys.argv[1] if len(sys.argv) > 1 else "."
    manifest_path = os.path.join(repo, "src", "features", "map", "generated", "manifest.json")
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    out_dir = os.path.join(repo, "scripts", "map-assets", "masks")
    os.makedirs(out_dir, exist_ok=True)
    for name, base in manifest["bases"].items():
        if base.get("custom"):
            continue  # build_levels.py で作った土台のマスクはそのまま
        img = Image.open(os.path.join(repo, "public", base["src"].lstrip("/"))).convert("RGBA")
        mask = lawn_mask(img)
        rgba = np.zeros((img.height, img.width, 4), np.uint8)
        rgba[mask] = (0, 255, 0, 255)                   # 草地＝緑、それ以外＝透明
        Image.fromarray(rgba).save(os.path.join(out_dir, f"{name}-mask.png"))
        print(name, f"草地 {mask.mean():.0%}")


if __name__ == "__main__":
    main()