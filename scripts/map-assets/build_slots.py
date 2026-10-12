"""草地マスクから、家・城・ステージ・桜・ペンライトを置く位置を決めて slots.json に書く。

使い方:
  py scripts/map-assets/build_slots.py .
出力:
  src/features/map/generated/slots.json
座標は土台画像に対する割合 (u, v) = (0〜1, 0〜1)。コード側で (u - 0.5) * 690 にして使う。
"""
import json, math, os, random, sys, zlib
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ISLAND_SIZE = 690  # マップ座標での島の大きさ（layout.ts の ISLAND_RADIUS * 2）

# 表示サイズ（マップ座標での横幅）。描画するコードもこの値を使う
SIZES = {"house": 26, "house-member": 28, "tree": 34, "stage": 50, "castle": 130, "penlight": 11}

HOUSE_LOTS = 11      # 家の区画の数（上位10件 or 検索結果10件 + 検索で開いたタグ1）
TOWN_ASPECT = 1.15   # 島を開いたときに画面に映す「街」の長方形の横:縦
TOWN_INNER = 0.72    # 家は街の長方形の内側 72% に置く（画面の縦横比が違っても切れないように）
GROWTH_COUNT = 9     # ステージ・桜・ペンライトはそれぞれ最大9個
Y_SQUASH = 1.6       # 斜め上から見ているので、画面の縦の距離は地面では長くなる
GAP = 0.95           # 隣どうしの最小距離 ＝ 横幅の平均 × GAP
GRID = 6             # 候補点の間隔(px)
HUB = 0.40           # 輪に並べるとき: 中央の広場（メンバーのアイコン）の半径 ＝ 街の半幅 × HUB
RING = 0.74          # 輪に並べるとき: 家を並べる輪の半径 ＝ 街の半幅 × RING


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


def far_enough(placed, x, y, w, gap):
    """すでに置いた物と重ならないか（地面での距離で比べる）"""
    for (qx, qy, qw) in placed:
        d = ((x - qx) ** 2 + ((y - qy) * Y_SQUASH) ** 2) ** 0.5
        if d < (w + qw) / 2 * gap:
            return False
    return True


def pick(cands, mask, placed, w, count, key, rnd, gap=GAP):
    """候補点を key の小さい順に見て、置けるものを count 個まで選ぶ"""
    scored = sorted(cands, key=lambda p: key(p) + rnd.uniform(0, 12))
    chosen = []
    for (x, y) in scored:
        if len(chosen) >= count:
            break
        if fits(mask, x, y, w) and far_enough(placed, x, y, w, gap):
            placed.append((x, y, w))
            chosen.append((x, y))
    return chosen


def town_rect(main, cx0, cy0):
    """いちばん広い草地の中に収まる、横:縦 = TOWN_ASPECT の最大の長方形 (cx, cy, 半幅, 半高さ)"""
    h, wd = main.shape
    ii = np.pad(main.astype(np.int32).cumsum(0).cumsum(1), ((1, 0), (1, 0)))

    def inside(cx, cy, s):
        x0, x1 = int(cx - TOWN_ASPECT * s), int(cx + TOWN_ASPECT * s)
        y0, y1 = int(cy - s), int(cy + s)
        if x0 < 0 or y0 < 0 or x1 >= wd or y1 >= h:
            return False
        total = ii[y1 + 1, x1 + 1] - ii[y0, x1 + 1] - ii[y1 + 1, x0] + ii[y0, x0]
        return total == (x1 - x0 + 1) * (y1 - y0 + 1)

    best = (cx0, cy0, 0.0, -1e9)
    ys, xs = np.where(main[::8, ::8])
    for gy, gx in zip(ys * 8, xs * 8):
        lo, hi = 0.0, 400.0
        while hi - lo > 2:
            mid = (lo + hi) / 2
            if inside(gx, gy, mid):
                lo = mid
            else:
                hi = mid
        score = lo - 0.03 * (((gx - cx0) ** 2 + (gy - cy0) ** 2) ** 0.5)  # 同じ大きさなら中心寄り
        if score > best[3]:
            best = (float(gx), float(gy), lo, score)
    cx, cy, s, _ = best

    return cx, cy, TOWN_ASPECT * s, s


def spread_lots(mask, placed, cx, cy, hw, hh, w, rnd):
    """街の長方形の内側に、家の区画を HOUSE_LOTS 個、できるだけ離して置く（中心から近い順に並べる）"""
    iw, ih = hw * TOWN_INNER, hh * TOWN_INNER
    cands = [(cx + rnd.uniform(-iw, iw), cy + rnd.uniform(-ih, ih)) for _ in range(4000)]
    spacing = ((4 * iw * ih) / HOUSE_LOTS) ** 0.5 * 1.15
    chosen = []
    while spacing > w * 0.5:
        chosen = []
        for (x, y) in cands:
            if not fits(mask, x, y, w):
                continue
            if all(((x - qx) ** 2 + ((y - qy) * Y_SQUASH) ** 2) ** 0.5 >= spacing for qx, qy in chosen):
                chosen.append((x, y))
                if len(chosen) == HOUSE_LOTS:
                    break
        if len(chosen) == HOUSE_LOTS:
            break
        spacing *= 0.95
    chosen.sort(key=lambda p: ((p[0] - cx) ** 2 + ((p[1] - cy) * Y_SQUASH) ** 2) ** 0.5)
    for (x, y) in chosen:
        placed.append((x, y, w))
    return chosen


def ring_lots(mask, placed, cx, cy, hw, hh, w):
    """街の中心のまわりの輪の上に、家の区画を HOUSE_LOTS 個、等間隔に並べる（中央はメンバーの広場として空ける）。
    12時の位置から時計回りの順（家の順位の順）。草地からはみ出すところは少し内側へ寄せ、それでも置けない角度は飛ばす"""
    chosen = []
    for n in range(HOUSE_LOTS, HOUSE_LOTS + 9):
        pts = []
        for i in range(n):
            a = -math.pi / 2 + 2 * math.pi * i / n
            for r in np.linspace(1.0, 0.72, 8):
                x, y = cx + math.cos(a) * hw * RING * r, cy + math.sin(a) * hh * RING * r
                if fits(mask, x, y, w):
                    pts.append((x, y))
                    break
        if len(pts) >= HOUSE_LOTS:
            chosen = pts
            break
        if len(pts) > len(chosen):
            chosen = pts
    # 多すぎるときは、いちばん詰まっているところから間引く
    dist = lambda p, q: ((p[0] - q[0]) ** 2 + ((p[1] - q[1]) * Y_SQUASH) ** 2) ** 0.5
    while len(chosen) > HOUSE_LOTS:
        gaps = [dist(chosen[i], chosen[(i + 1) % len(chosen)]) for i in range(len(chosen))]
        chosen.pop(int(np.argmin(gaps)))
    for (x, y) in chosen:
        placed.append((x, y, w))
    return chosen


def build(name, mask, top=None, ring=False):
    """top: 島を開いたときに映してよい範囲（省略すると草地マスクから作る）。
    ring: True なら家を街の中心のまわりの輪に並べ、中央をメンバーのアイコンの広場（hub）にする"""
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
    # 1) 街: 島を開いたときに画面いっぱいに映す長方形。家はこの中に置く
    # 草地のあいだの石畳や小道も「島の上」として、街の長方形に含めてよい（崖・水が映らなければよい）
    if top is None:
        top = ndi.binary_fill_holes(ndi.binary_closing(mask, iterations=24))
    labels2, n2 = ndi.label(top)
    sizes2 = ndi.sum(top, labels2, range(1, n2 + 1))
    top = labels2 == (np.argmax(sizes2) + 1)
    tx, ty, thw, thh = town_rect(top, cx, cy)
    if ring:
        lots = ring_lots(mask, placed, tx, ty, thw, thh, px("house-member", wd))
        placed.append((tx, ty, thw * HUB * 2))  # 広場には城などを置かない
    else:
        lots = spread_lots(mask, placed, tx, ty, thw, thh, px("house-member", wd), rnd)
    # 2) 城: 奥（上）の真ん中。1000人で現れても家が動かないよう、家とは重ならない場所を取っておく
    castle_scale = 1.0
    castle = []
    while not castle and castle_scale > 0.5:
        castle = pick(cands, mask, placed, px("castle", wd) * castle_scale, 1,
                      lambda p: p[1] + abs(p[0] - cx) * 0.7, rnd)
        if not castle:
            castle_scale -= 0.1
    # 3) ステージ・桜: 奥と左右から。4) ペンライト: 手前から（家を隠さないため）
    back_or_side = lambda p: p[1] - abs(p[0] - cx) * 0.8
    stage = pick(cands, mask, placed, px("stage", wd), GROWTH_COUNT, back_or_side, rnd)
    tree = pick(cands, mask, placed, px("tree", wd), GROWTH_COUNT, back_or_side, rnd)
    penlight = pick(cands, mask, placed, px("penlight", wd), GROWTH_COUNT, lambda p: -p[1], rnd)

    norm = lambda pts: [[round(x / wd, 4), round(y / h, 4)] for x, y in pts]
    print(f"{name}: 街 {thw * 2:.0f}x{thh * 2:.0f}px 城 {len(castle)}(x{castle_scale:.1f}) 家 {len(lots)} ステージ {len(stage)} 桜 {len(tree)} ペンライト {len(penlight)}")
    out = {
        "plaza": norm([(cx, cy)])[0],
        "town": {"center": norm([(tx, ty)])[0], "size": [round(thw * 2 / wd, 4), round(thh * 2 / h, 4)]},
        "castle": {"anchor": norm(castle)[0] if castle else None, "scale": round(castle_scale, 2)},
        "lots": norm(lots),
        "stage": norm(stage),
        "tree": norm(tree),
        "penlight": norm(penlight),
    }
    if ring:
        out["hub"] = {"center": norm([(tx, ty)])[0], "radius": [round(thw * HUB / wd, 4), round(thh * HUB / h, 4)]}
    return out


def main():
    repo = sys.argv[1] if len(sys.argv) > 1 else "."
    gen = os.path.join(repo, "src", "features", "map", "generated")
    with open(os.path.join(gen, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    out = {"islandSize": ISLAND_SIZE, "sizes": SIZES, "bases": {}}
    old_path = os.path.join(gen, "slots.json")
    old = {}
    if os.path.exists(old_path):
        with open(old_path, encoding="utf-8") as f:
            old = json.load(f).get("bases", {})
    for name in manifest["bases"]:
        if manifest["bases"][name].get("custom") and name in old:
            out["bases"][name] = old[name]  # build_levels.py で作った土台はそのまま
            continue
        mask_img = Image.open(os.path.join(repo, "scripts", "map-assets", "masks", f"{name}-mask.png"))
        mask = np.array(mask_img.getchannel("A")) > 0
        out["bases"][name] = build(name, mask)
    with open(os.path.join(gen, "slots.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
