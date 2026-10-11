"""草地マスクから、家・城・ステージ・桜・ペンライトを置く位置を決めて slots.json に書く。

使い方:
  py scripts/map-assets/build_slots.py .
出力:
  src/features/map/generated/slots.json
座標は土台画像に対する割合 (u, v) = (0〜1, 0〜1)。コード側で (u - 0.5) * 690 にして使う。
"""
import json, os, random, sys, zlib
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ISLAND_SIZE = 690  # マップ座標での島の大きさ（layout.ts の ISLAND_RADIUS * 2）

# 表示サイズ（マップ座標での横幅）。描画するコードもこの値を使う
SIZES = {"house": 44, "house-member": 48, "tree": 42, "stage": 60, "castle": 160, "penlight": 14}

HOUSE_LOTS = 20      # 家の区画の数（メンバー最大9 + 話題タグ上位10 + 予備）
GROWTH_COUNT = 9     # ステージ・桜・ペンライトはそれぞれ最大9個
Y_SQUASH = 1.6       # 斜め上から見ているので、画面の縦の距離は地面では長くなる
GAP = 0.95           # 隣どうしの最小距離 ＝ 横幅の平均 × GAP
GRID = 6             # 候補点の間隔(px)


def px(role, canvas):
    """表示サイズ（マップ座標）を土台画像の px に変える"""
    return SIZES[role] / ISLAND_SIZE * canvas


def fits(mask, x, y, w):
    """接地点 (x, y) に横幅 w の物を置いたとき、足元のひし形が草地に収まるか"""
    fw = w * 0.8                       # 足元の幅（屋根のはみ出しを除いた分）
    pts = [(x, y), (x - fw / 2, y - fw / 4), (x + fw / 2, y - fw / 4), (x, y - fw / 2), (x, y - fw / 4)]
    h, wd = mask.shape
    for px_, py_ in pts:
        ix, iy = int(px_), int(py_)
        if not (0 <= ix < wd and 0 <= iy < h) or not mask[iy, ix]:
            return False
    return True


def far_enough(placed, x, y, w):
    """すでに置いた物と重ならないか（地面での距離で比べる）"""
    for (qx, qy, qw) in placed:
        d = ((x - qx) ** 2 + ((y - qy) * Y_SQUASH) ** 2) ** 0.5
        if d < (w + qw) / 2 * GAP:
            return False
    return True


def pick(cands, mask, placed, w, count, key, rnd):
    """候補点を key の小さい順に見て、置けるものを count 個まで選ぶ"""
    scored = sorted(cands, key=lambda p: key(p) + rnd.uniform(0, 12))
    chosen = []
    for (x, y) in scored:
        if len(chosen) >= count:
            break
        if fits(mask, x, y, w) and far_enough(placed, x, y, w):
            placed.append((x, y, w))
            chosen.append((x, y))
    return chosen


def build(name, mask):
    h, wd = mask.shape
    rnd = random.Random(zlib.crc32(name.encode()))  # 土台ごとに毎回同じ結果になる乱数
    ys, xs = np.mgrid[0:h:GRID, 0:wd:GRID]
    ok = mask[ys, xs]
    cands = [(float(x + rnd.uniform(-2, 2)), float(y + rnd.uniform(-2, 2))) for x, y in zip(xs[ok], ys[ok])]

    labels, n = ndi.label(mask)
    sizes = ndi.sum(mask, labels, range(1, n + 1))
    main = labels == (np.argmax(sizes) + 1)        # いちばん広い草地
    my, mx = np.where(main)
    cx, cy = float(mx.mean()), float(my.mean())    # 広場（いちばん広い草地の中心）

    placed = []
    # 1) 城: 奥（上）の真ん中。1000人で現れても家が動かないよう、最初に場所を取っておく
    castle_scale = 1.0
    castle = []
    while not castle and castle_scale > 0.5:
        castle = pick(cands, mask, placed, px("castle", wd) * castle_scale, 1,
                      lambda p: p[1] + abs(p[0] - cx) * 0.7, rnd)
        if not castle:
            castle_scale -= 0.1
    # 2) 家: 広場から近い順。順番どおりにメンバー → 話題タグ（順位順）が入る
    lots = pick(cands, mask, placed, px("house-member", wd), HOUSE_LOTS,
                lambda p: ((p[0] - cx) ** 2 + ((p[1] - cy) * Y_SQUASH) ** 2) ** 0.5, rnd)
    # 3) ステージ・桜: 奥と左右から。4) ペンライト: 手前から（家を隠さないため）
    back_or_side = lambda p: p[1] - abs(p[0] - cx) * 0.8
    stage = pick(cands, mask, placed, px("stage", wd), GROWTH_COUNT, back_or_side, rnd)
    tree = pick(cands, mask, placed, px("tree", wd), GROWTH_COUNT, back_or_side, rnd)
    penlight = pick(cands, mask, placed, px("penlight", wd), GROWTH_COUNT, lambda p: -p[1], rnd)

    norm = lambda pts: [[round(x / wd, 4), round(y / h, 4)] for x, y in pts]
    print(f"{name}: 城 {len(castle)}(x{castle_scale:.1f}) 家 {len(lots)} ステージ {len(stage)} 桜 {len(tree)} ペンライト {len(penlight)}")
    return {
        "plaza": norm([(cx, cy)])[0],
        "castle": {"anchor": norm(castle)[0] if castle else None, "scale": round(castle_scale, 2)},
        "lots": norm(lots),
        "stage": norm(stage),
        "tree": norm(tree),
        "penlight": norm(penlight),
    }


def main():
    repo = sys.argv[1] if len(sys.argv) > 1 else "."
    gen = os.path.join(repo, "src", "features", "map", "generated")
    with open(os.path.join(gen, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    out = {"islandSize": ISLAND_SIZE, "sizes": SIZES, "bases": {}}
    for name in manifest["bases"]:
        mask_img = Image.open(os.path.join(repo, "scripts", "map-assets", "masks", f"{name}-mask.png"))
        mask = np.array(mask_img.getchannel("A")) > 0
        out["bases"][name] = build(name, mask)
    with open(os.path.join(gen, "slots.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()