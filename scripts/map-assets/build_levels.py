"""島のレベル絵（lv1〜lv5）を、マップで使える形にして登録する。

使い方:
  py scripts/map-assets/build_levels.py <絵のフォルダ> <土台> [--palette 色] [--repo リポジトリのルート]
  py scripts/map-assets/build_levels.py --all <島ごとのフォルダが入った親フォルダ>
  py scripts/map-assets/build_levels.py --slots-only   （絵はそのままで、家の位置だけ作り直す）
  例: py scripts/map-assets/build_levels.py --all "../../Island design/デザイン用画像/デザイン用画像"
      （арал1 → base-01, арал2 → base-03, арал3 → base-05, арал4 → base-07,
        арал5 → base-09 … は新しい土台。絵が入っていないフォルダは飛ばす）
  例: py scripts/map-assets/build_levels.py --all "../../Island design/oshimarin-island-levels"
      （色の名前のフォルダでもよい。青 → base-01, 緑 → base-03, ピンク → base-05, 黄 → base-07。
        「бүдэг（淡い）/ pale / kawaii」はかわいい、「бараан（濃い）/ dark / cool」はかっこいいの絵。
        例: 「бүдэг цэнхэр арал」＝青い島のかわいい、「бараан цэнхэр арал」＝青い島のかっこいい。
        フォルダの中にもう1段同じ名前のフォルダがあっても、絵のあるところまで降りて探す）

絵のレベルは、ファイル名から次の順に決める
  1. 「lv3」「Level 3」「Level three」などがあれば、そのレベル
  2. 名前の最後の「-3」「_3」（そのレベルがまだ空いていれば）
  3. それでも決まらない絵は、草地が広い（建物が少ない）順に、空いているレベルへ
  - lv1 … 何もない島。これが土台になる。島を開いた画面（家10軒）は、どのレベルでもこの絵
  - lv2〜lv5 … 島民が増えると、世界地図でこの絵に切り替わる
  - フォルダの中に cool / kawaii というフォルダを作ると、その中の絵はそのモード専用になる
    （名前に cool / kawaii が入っている絵も同じ）。片方のモードの絵しかなければ、両方のモードで使う
  - モード専用の lv1 があれば、そのモードでは島の形（土台）も変わる。家の位置もその土台に合わせて作る
  - png / jpg / webp。正方形・背景透明が望ましい（白い背景なら自動で抜く）
  - lv2〜lv5 の島の位置や大きさが lv1 と少しずれていても、自動で lv1 に重なるように合わせる

やること:
  1. lv1 を土台にする（public/map/base/<土台>.webp）
  2. lv1 から草地マスク（scripts/map-assets/masks/<土台>-mask.png）と、
     家・木などの位置（slots.json の <土台>）を作り直す
     （家10軒＋1軒は、街の中心の広場（hub。メンバーのアイコンを並べる）を囲む輪に並べる）
  3. lv2〜lv5 を lv1 に重ねて public/map/levels/<土台>/<モード>/lv<N>.webp に保存する
     （城の塔などがはみ出してもよいように、土台より上下に余白を付けた絵にする）
  4. manifest.json の bases と levels に登録する（build_assets.py をやり直しても消えない）
"""
import argparse, functools, json, os, re, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.signal import fftconvolve
from scipy.spatial import ConvexHull

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_slots  # noqa: E402
from build_masks import lawn_mask  # noqa: E402

CANVAS = 1254                          # 土台の絵の大きさ（ほかの土台と同じ）
FRAME = {"top": 0.4, "bottom": 0.1}    # レベルの絵の、土台より上・下の余白（土台の大きさに対する割合）
FILL = 0.96                            # 島の横幅をキャンバスの 96% にそろえる（ほかの土台と同じ）
CENTER_Y = 0.51                        # 島の上下の真ん中を、キャンバスの 51% の高さにそろえる
LEVEL_SCALE = 0.75                     # レベルの絵は世界地図（引きの画面）でしか見えないので、少し小さく保存する
MODES = ("cool", "kawaii")
PALETTES = ("blue", "green", "pink", "purple")
# --all のとき: フォルダの番号 → 島の土台
# （シードの島: base-01 ARASHI（青）・base-03 M!LK（緑）・base-05 TWICE（ピンク）・base-07 FRUITSZIPPER（黄））。
# 5番からは新しい土台（base-09, base-11, …）になり、/dev/islands で新しい島に選べる
ISLAND_BASES = ("base-01", "base-03", "base-05", "base-07")


def island_base(n):
    """フォルダの番号 n → (土台の名前, 新しい土台のときの家の色)"""
    if n <= len(ISLAND_BASES):
        return ISLAND_BASES[n - 1], None
    return f"base-{2 * n - 1:02d}", PALETTES[(n - 1) % len(PALETTES)]
ISLAND_FOLDER = re.compile(r"^(?:арал|aral|island|島)[\s_-]*(\d+)$", re.IGNORECASE)
# --all のとき: 色の名前のフォルダ → 島の土台。淡い色はかわいい、濃い色はかっこいいの絵
COLOR_WORDS = {
    "blue": ("цэнхэр", "blue", "青", "ブルー"),
    "green": ("ногоон", "green", "緑", "グリーン"),
    "pink": ("ягаан", "pink", "ピンク"),
    "yellow": ("шар", "yellow", "黄", "イエロー"),
}
COLOR_BASES = {"blue": "base-01", "green": "base-03", "pink": "base-05", "yellow": "base-07"}
MODE_WORDS = {
    "kawaii": ("бүдэг", "цайвар", "pale", "kawaii", "かわいい", "淡"),
    "cool": ("бараан", "dark", "cool", "かっこいい", "濃"),
}


def color_folder(name):
    """フォルダ名 → (色, モード)。色とモードの両方が分からなければ None"""
    lower = name.lower()
    colors = [c for c, words in COLOR_WORDS.items() if any(w in lower for w in words)]
    modes = [m for m, words in MODE_WORDS.items() if any(w in lower for w in words)]
    return (colors[0], modes[0]) if len(colors) == 1 and len(modes) == 1 else None


def image_dir(path):
    """絵が入っていないフォルダにフォルダが1つだけなら、その中へ降りる（zip を展開すると1段深くなるため）"""
    while True:
        names = os.listdir(path)
        if any(n.lower().endswith(EXTS) for n in names):
            return path
        subs = [n for n in names if os.path.isdir(os.path.join(path, n)) and n.lower() not in MODES]
        if len(subs) != 1 or any(os.path.isdir(os.path.join(path, n)) and n.lower() in MODES for n in names):
            return path
        path = os.path.join(path, subs[0])
EXTS = (".png", ".jpg", ".jpeg", ".webp")
WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9}
NAMED = re.compile(r"(?:lv|level)[\s_-]*0*([1-9]|one|two|three|four|five|six|seven|eight|nine)(?![a-z])", re.IGNORECASE)
TRAILING = re.compile(r"[-_ ]([1-9])$")


def find_files(src):
    """フォルダの絵を {(モード または None, レベル): パス} にする。
    src は1つのフォルダか、{モード: フォルダ}（色の名前のフォルダのとき）"""
    found, rest, entries = {}, [], []
    if isinstance(src, dict):
        for mode, folder in sorted(src.items()):
            folder = image_dir(folder)
            for file in sorted(os.listdir(folder)):
                if file.lower().endswith(EXTS):
                    entries.append((os.path.splitext(file)[0], mode, os.path.join(folder, file)))
        src_dir = None
    else:
        src_dir = image_dir(src)
    for file in sorted(os.listdir(src_dir)) if src_dir else ():
        path = os.path.join(src_dir, file)
        if os.path.isdir(path) and file.lower() in MODES:  # cool / kawaii フォルダ ＝ そのモード専用
            for sub in sorted(os.listdir(path)):
                if sub.lower().endswith(EXTS):
                    entries.append((os.path.splitext(sub)[0], file.lower(), os.path.join(path, sub)))
        elif file.lower().endswith(EXTS):
            stem = os.path.splitext(file)[0]
            lower = stem.lower()
            entries.append((stem, "cool" if "cool" in lower else "kawaii" if "kawaii" in lower else None, path))
    for stem, mode, path in entries:
        m = NAMED.search(stem)
        level = (WORDS.get(m.group(1).lower()) or int(m.group(1))) if m else None
        if level and (mode, level) not in found:
            found[(mode, level)] = path
        else:
            rest.append((stem, mode, path))
    # 名前の最後の数字（レベルが空いていれば）
    left = []
    for stem, mode, path in rest:
        m = TRAILING.search(stem)
        if m and (mode, int(m.group(1))) not in found:
            found[(mode, int(m.group(1)))] = path
        else:
            left.append((mode, path))
    # 残りは、草地が広い（建物が少ない）順に、空いているレベルへ
    for mode, path in sorted(left, key=lambda mp: -island_lawn(load(mp[1])).mean()):
        level = next(n for n in range(1, 10) if (mode, n) not in found)
        found[(mode, level)] = path
    for (mode, level), path in sorted(found.items(), key=lambda kv: (kv[0][1], kv[0][0] or "")):
        print(f"  lv{level}{f' ({mode})' if mode else ''}: {os.path.basename(path)}")
    return found


def pick_file(found, mode, level):
    """そのモードの絵 → モード指定なしの絵 → もう片方のモードの絵 の順に探す"""
    other = "kawaii" if mode == "cool" else "cool"
    for key in ((mode, level), (None, level), (other, level)):
        if key in found:
            return found[key]
    return None


def remove_background(img):
    """透明な部分がほとんどない画像は、外周とつながった白っぽい背景を透明にする"""
    a = np.array(img.getchannel("A"))
    if (a < 250).mean() > 0.05:
        return img  # すでに背景が透明
    rgb = np.array(img.convert("RGB")).astype(int)
    light = (rgb.min(axis=2) > 225) & (rgb.max(axis=2) - rgb.min(axis=2) < 25)
    labels, _ = ndi.label(light)
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])))
    border.discard(0)
    rgba = np.array(img)
    rgba[np.isin(labels, list(border)), 3] = 0
    print("  白い背景を透明にしました")
    return Image.fromarray(rgba)


def to_canvas(img):
    """CANVAS×CANVAS にする。正方形ならそのまま縮小・拡大、そうでなければ真ん中に収める"""
    if img.size == (CANVAS, CANVAS):
        return img
    if img.width == img.height:
        return img.resize((CANVAS, CANVAS), Image.LANCZOS)
    scale = CANVAS / max(img.width, img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(resized, ((CANVAS - resized.width) // 2, (CANVAS - resized.height) // 2), resized)
    return canvas


def pastel_lawn_mask(img):
    """パステル調の島（草地の色が薄い絵）用: 島の上面を、黄緑のまだら模様から形として取り出す"""
    hsv = np.array(img.convert("RGB").convert("HSV")).astype(int)
    alpha = np.array(img.getchannel("A")) > 200
    h, s = hsv[..., 0], hsv[..., 1]
    green = alpha & (h >= 25) & (h <= 80) & (s >= 15)     # 薄い黄緑（ピンクや紫のまだらはあとで埋める）
    top = ndi.binary_closing(green, iterations=12)       # まだらをつなげる
    top = ndi.binary_fill_holes(top) & alpha
    top = largest(top)
    top = largest(ndi.binary_opening(top, iterations=20))  # 崖のコケなど細い出っぱりを切り離す
    top = fill_hull(top) & alpha                          # 上面は凸なひし形。縁のピンクのまだらも含める
    return ndi.binary_erosion(top, iterations=20)         # 縁の石やコケから少し内側へ


def fill_hull(mask):
    """mask を囲む凸多角形の内側を True にする"""
    edge = mask & ~ndi.binary_erosion(mask)
    ys, xs = np.nonzero(edge)
    if len(xs) < 3:
        return mask
    pts = np.column_stack([xs, ys])
    hull = ConvexHull(pts)
    canvas = Image.new("L", (mask.shape[1], mask.shape[0]), 0)
    ImageDraw.Draw(canvas).polygon([tuple(map(int, pts[i])) for i in hull.vertices], fill=1)
    return np.array(canvas).astype(bool)


def largest(mask):
    labels, n = ndi.label(mask)
    if n == 0:
        return mask
    sizes = ndi.sum(mask, labels, range(1, n + 1))
    return labels == (np.argmax(sizes) + 1)


def otsu(values):
    """明るさを2つに分けるしきい値（大津の方法）"""
    hist, _ = np.histogram(values, bins=256, range=(0, 256))
    p = hist / max(1, hist.sum())
    w = np.cumsum(p)
    mu = np.cumsum(p * np.arange(256))
    between = (mu[-1] * w - mu) ** 2 / (w * (1 - w) + 1e-12)
    return int(np.argmax(between))


def top_surface_mask(img):
    """島の上面を取り出す: 上面は光が当たって明るく、崖は影で暗い。島の上の池（水色）は除く"""
    alpha = np.array(img.getchannel("A")) > 200
    rgb = np.array(img.convert("RGB")).astype(float)
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    weight = ndi.gaussian_filter(alpha.astype(float), 6)
    lum = ndi.gaussian_filter(np.where(alpha, lum, 0), 6) / np.maximum(weight, 1e-3)  # 模様をならす
    hsv = np.array(img.convert("RGB").convert("HSV")).astype(int)
    water = (hsv[..., 0] >= 112) & (hsv[..., 0] <= 145) & (hsv[..., 1] >= 45) & (hsv[..., 2] >= 200)
    top = alpha & (lum >= otsu(np.clip(lum[alpha], 0, 255))) & ~water
    top = largest(ndi.binary_opening(top, iterations=3))
    top = ndi.binary_fill_holes(ndi.binary_closing(top, iterations=8)) & alpha
    top = largest(ndi.binary_opening(top, iterations=15))  # 崖の明るいところなど細い出っぱりを切り離す
    return ndi.binary_erosion(top, iterations=16)           # 縁から少し内側へ


def island_lawn(img):
    """家を置ける島の上面。3つのやり方で取り出して、もっともらしいうちでいちばん広いものを使う"""
    alpha_mask_ = np.array(img.getchannel("A")) > 200
    alpha = alpha_mask_.mean()
    rows = np.where(alpha_mask_.any(axis=1))[0]
    cut = int(rows[0] + 0.6 * (rows[-1] - rows[0]))  # 島の下 40% はほとんど崖

    def low(m):
        return m[cut:].sum() / max(1, m.sum())

    cands = [("上面（明るさ）", top_surface_mask(img)), ("緑の草地", lawn_mask(img)), ("上面（パステル）", pastel_lawn_mask(img))]
    # 島全体の 8% 未満は狭すぎ、75% より広いか、下のほう（崖）に 13% より多くかかっていれば崖まで入っている
    good = [(n, m) for n, m in cands if 0.08 * alpha <= m.mean() <= 0.75 * alpha and low(m) <= 0.13]
    if good:
        name, mask = max(good, key=lambda nm: nm[1].mean())
    else:
        name, mask = min(cands, key=lambda nm: low(nm[1]))
    print(f"  家を置く面: {name}")
    return mask


@functools.lru_cache(maxsize=None)
def load(path):
    return to_canvas(remove_background(Image.open(path).convert("RGBA")))


def alpha_mask(img, size=None):
    if size:
        img = img.resize(size, Image.BILINEAR)
    return (np.array(img.getchannel("A")) > 128).astype(np.float32)


def side_band(ref):
    """島の左右の端（横幅の外側 12% ずつ）の列。真ん中の城や木の違いに左右されずに位置を合わせるため"""
    cols = np.where(ref.any(axis=0))[0]
    band = np.zeros_like(ref)
    if len(cols):
        x0, x1 = cols[0], cols[-1]
        w = max(1, int((x1 - x0) * 0.12))
        band[:, x0:x0 + w] = 1
        band[:, x1 - w:x1 + 1] = 1
    return band


def best_shift(ref, mov, center, window):
    """mov を ref に重ねたとき、重なりがいちばん大きくなる位置（mov の左上の座標）。
    重なり ＝ 島の左右の端での IoU ＋ 全体の IoU × 0.25"""
    flip = mov[::-1, ::-1]
    inter = fftconvolve(ref, flip, mode="full")             # すべてのずらし方の重なりを一度に計算
    oy, ox = mov.shape[0] - 1, mov.shape[1] - 1             # inter[oy + dy, ox + dx] が (dx, dy) の重なり
    band = side_band(ref)
    ref_band = ref * band
    inter_band = fftconvolve(ref_band, flip, mode="full")
    mov_band = fftconvolve(band, flip, mode="full")
    iou = (inter_band / (ref_band.sum() + mov_band - inter_band + 1e-6)
           + 0.25 * inter / (ref.sum() + mov.sum() - inter + 1e-6))
    cx, cy = center
    y0, y1 = max(0, oy + cy - window), min(iou.shape[0], oy + cy + window + 1)
    x0, x1 = max(0, ox + cx - window), min(iou.shape[1], ox + cx + window + 1)
    sub = iou[y0:y1, x0:x1]
    iy, ix = np.unravel_index(np.argmax(sub), sub.shape)
    return int(x0 + ix - ox), int(y0 + iy - oy), float(sub[iy, ix])


def framing(img):
    """島がキャンバスいっぱいに描かれていない絵（上に城のための余白がある絵など）を、
    ほかの土台と同じ大きさ・位置にそろえる変換 (倍率, 左上x, 左上y)。すでにそろっていれば None"""
    a = np.array(img.getchannel("A")) > 128
    ys, xs = np.where(a)
    w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    cy = (ys.min() + ys.max()) / 2
    if w >= CANVAS * 0.9 and abs(cy - CANVAS * CENTER_Y) < CANVAS * 0.06:
        return None
    scale = min(CANVAS * FILL / w, CANVAS * 0.98 / h)
    dx = CANVAS / 2 - (xs.min() + xs.max()) / 2 * scale
    dy = CANVAS * CENTER_Y - cy * scale
    print(f"  島の大きさ・位置をほかの土台にそろえます（倍率 {scale:.2f}）")
    return scale, round(dx), round(dy)


def apply_framing(img, t):
    if t is None:
        return img
    scale, dx, dy = t
    size = round(CANVAS * scale)
    resized = img.resize((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(resized, (dx, dy), resized)
    return canvas


def align(img, ref, s0=1.0, dx0=0, dy0=0):
    """img（lv2〜）の島が ref（lv1）の島に重なる倍率と位置を探す。(縮小・拡大した絵, 左上x, 左上y)
    (s0, dx0, dy0) は最初の見当（lv1 と同じ変換）"""
    half = CANVAS // 2
    ref_small = alpha_mask(ref, (half, half))
    best = (0.0, 1.0, 0, 0)
    for scale in s0 * np.arange(0.90, 1.1001, 0.02):  # まず半分の大きさで、だいたいの倍率と位置
        size = round(half * scale)
        mov = alpha_mask(img, (size, size))
        # 見当の変換と、絵の中心が同じところに来る位置を中心に探す
        cx = round(dx0 / 2 + (s0 - scale) * half / 2)
        cy = round(dy0 / 2 + (s0 - scale) * half / 2)
        dx, dy, iou = best_shift(ref_small, mov, (cx, cy), round(half * 0.3))
        if iou > best[0]:
            best = (iou, float(scale), dx * 2, dy * 2)
    _, coarse, cdx, cdy = best
    ref_full = alpha_mask(ref)
    best = (0.0, None, 0, 0)
    for scale in coarse + np.array([-0.01, -0.005, 0.0, 0.005, 0.01]):  # 元の大きさで、倍率と位置を細かく
        size = round(CANVAS * scale)
        resized = img.resize((size, size), Image.LANCZOS) if size != CANVAS else img
        shift = round((size - round(CANVAS * coarse)) / 2)  # 倍率を変えた分、中心がずれないように
        dx, dy, iou = best_shift(ref_full, alpha_mask(resized), (cdx - shift, cdy - shift), 8)
        if iou > best[0]:
            best = (iou, resized, dx, dy)
            print_scale = scale
    iou, resized, dx, dy = best
    print(f"  lv1 に合わせる: 倍率 {print_scale:.3f}, ずらし ({dx}, {dy}), 重なり {iou / 1.25:.0%}")
    return resized, dx, dy


def framed(resized, dx, dy):
    """土台より上下に余白を付けたキャンバスに、lv1 に重なる位置で置く"""
    top, bottom = round(CANVAS * FRAME["top"]), round(CANVAS * FRAME["bottom"])
    canvas = Image.new("RGBA", (CANVAS, top + CANVAS + bottom), (0, 0, 0, 0))
    canvas.paste(resized, (dx, dy + top), resized)  # はみ出した部分は切り落とされる
    size = (round(canvas.width * LEVEL_SCALE), round(canvas.height * LEVEL_SCALE))
    return canvas.resize(size, Image.LANCZOS)


def top_band(img):
    """島の上面がある高さの帯（明るい上面の一番上〜一番下）。もう片方のモードの草地を借りるとき、手前の崖を除くのに使う"""
    top = top_surface_mask(img)
    band = np.zeros(top.shape, bool)
    rows = np.where(top.any(axis=1))[0]
    if len(rows):
        h = top.shape[0]
        band[max(0, rows[0] - int(0.03 * h)): rows[-1] + int(0.02 * h)] = True
    else:
        band[:] = True
    return band


def make_base(lv1_path, base, suffix, repo, fallback=None):
    """lv1 の絵から土台を作る（suffix は "" か "-cool" など）。(土台の絵, 変換, slots の項目, manifest の絵の項目, 草地マスク)
    fallback: モード専用の土台で草地がうまく見つからない（暗い絵など）ときに使う、もう片方のモードの草地マスク"""
    name = f"{base}{suffix}"
    # 島が小さく描かれていれば、ほかの土台と同じ大きさ・位置にそろえる
    lv1_raw = load(lv1_path)
    frame_t = framing(lv1_raw)
    lv1 = apply_framing(lv1_raw, frame_t)
    os.makedirs(os.path.join(repo, "public", "map", "base"), exist_ok=True)
    lv1.save(os.path.join(repo, "public", "map", "base", f"{name}.webp"), "WEBP", quality=82, method=4)
    # 草地マスクと、家・木などの位置
    mask = island_lawn(lv1)
    alpha = np.array(lv1.getchannel("A")) > 200
    if fallback is not None and mask.sum() < 0.85 * fallback.sum():
        # 両モードの絵は同じ位置・大きさにそろえてあるので、もう片方の草地を、この絵の島の内側に収めて使う
        mask = fallback & ndi.binary_erosion(alpha, iterations=24) & top_band(lv1)
        print("  草地が狭く見つかったので、もう片方のモードの草地を使います")
    mask_dir = os.path.join(repo, "scripts", "map-assets", "masks")
    os.makedirs(mask_dir, exist_ok=True)
    rgba = np.zeros((CANVAS, CANVAS, 4), np.uint8)
    rgba[mask] = (0, 255, 0, 255)
    Image.fromarray(rgba).save(os.path.join(mask_dir, f"{name}-mask.png"))
    print(f"  草地 {mask.mean():.0%}")
    # 島を開いたときに映す範囲: 上面の細かいくぼみは埋める（大きなくぼみ＝空が見えるところは残す）
    top = ndi.binary_fill_holes(ndi.binary_closing(mask, iterations=40)) & ndi.binary_erosion(alpha, iterations=24)
    slot = build_slots.build(name, mask, largest(top), ring=True)
    return lv1, frame_t, slot, {"src": f"/map/base/{name}.webp", "width": CANVAS, "height": CANVAS}, mask


def build_island(folder, base, palette, repo, manifest, slots):
    """1つの島: lv1 を土台に、lv2〜 をレベルの絵にして、manifest と slots を書き換える"""
    label = " + ".join(f"{m}: {os.path.basename(p)}" for m, p in sorted(folder.items())) if isinstance(folder, dict) else folder
    print(f"{label} → {base}")
    found = find_files(folder)
    # どちらのモードでも使う土台: モード指定なしの lv1 → かわいいの lv1 → かっこいいの lv1
    default_mode = next((m for m in (None, "kawaii", "cool") if (m, 1) in found), "none")
    if default_mode == "none":
        print("  絵がありません（スキップ）")
        return

    # 1) lv1 → 土台。モード専用の lv1 があれば、そのモード用の土台も作る
    lv1, frame_t, slot, image, lawn = make_base(found[(default_mode, 1)], base, "", repo)
    old = manifest["bases"].get(base, {})
    entry = {
        **image,
        "palette": palette or old.get("palette", "pink"),
        "custom": True,  # build_assets.py / build_slots.py / build_masks.py はこの土台を作り直さない
    }
    slot_entry = dict(slot)
    refs = {}  # モード → (土台の絵, 変換, モード専用か)
    for mode in MODES:
        path = found.get((mode, 1))
        if path and path != found[(default_mode, 1)]:
            print(f"  {mode} モード専用の土台")
            vlv1, vt, vslot, vimage, _ = make_base(path, base, f"-{mode}", repo, fallback=lawn)
            entry.setdefault("modes", {})[mode] = vimage
            slot_entry.setdefault("modes", {})[mode] = vslot
            refs[mode] = (vlv1, vt, True)
        else:
            refs[mode] = (lv1, frame_t, False)
    manifest["bases"][base] = entry
    slots["bases"][base] = slot_entry

    # 2) lv2〜 → レベルの絵。モード専用の土台なら、そのモードの絵だけを使う。両方のモードで同じ絵なら1枚だけ保存する
    choice = {}
    for mode in MODES:
        own = refs[mode][2]
        for level in range(2, 10):
            if own:
                path = found.get((mode, level))
            else:
                path = found.get((mode, level)) or found.get((None, level)) or found.get((default_mode, level))
            if path:
                choice[(mode, level)] = (path, mode if own else "default")
    levels = {mode: {} for mode in MODES}
    written = set()
    for (mode, level), (path, ref_key) in sorted(choice.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        other = "kawaii" if mode == "cool" else "cool"
        shared = choice.get((other, level)) == (path, ref_key)
        rel = f"/map/levels/{base}/lv{level}.webp" if shared else f"/map/levels/{base}/{mode}/lv{level}.webp"
        if rel not in written:
            ref, t, _ = refs[mode]
            print(f"  lv{level}{'' if shared else f' ({mode})'}: {os.path.basename(path)}")
            out = os.path.join(repo, "public", rel.lstrip("/"))
            os.makedirs(os.path.dirname(out), exist_ok=True)
            framed(*align(load(path), ref, *(t or (1.0, 0, 0)))).save(out, "WEBP", quality=82, method=4)
            written.add(rel)
        levels[mode][str(level)] = rel
    manifest.setdefault("levels", {})[base] = levels
    manifest["levelFrame"] = FRAME
    counts = ", ".join(f"{m} {len(v)}枚" for m, v in levels.items())
    print(f"  {base}: 土台 + レベルの絵（{counts}）")


def slot_from_files(repo, name):
    """保存してある土台の絵（public/map/base/<name>.webp）とマスクから、家・木などの位置を作る"""
    lv1 = Image.open(os.path.join(repo, "public", "map", "base", f"{name}.webp")).convert("RGBA")
    mask = np.array(Image.open(os.path.join(repo, "scripts", "map-assets", "masks", f"{name}-mask.png")).getchannel("A")) > 0
    alpha = np.array(lv1.getchannel("A")) > 200
    top = ndi.binary_fill_holes(ndi.binary_closing(mask, iterations=40)) & ndi.binary_erosion(alpha, iterations=24)
    return build_slots.build(name, mask, largest(top), ring=True)


def rebuild_slots(repo):
    """build_levels.py で作った土台（custom）の家の位置だけを作り直す"""
    gen = os.path.join(repo, "src", "features", "map", "generated")
    with open(os.path.join(gen, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    with open(os.path.join(gen, "slots.json"), encoding="utf-8") as f:
        slots = json.load(f)
    for base, entry in manifest["bases"].items():
        if not entry.get("custom"):
            continue
        new = slot_from_files(repo, base)
        for mode in entry.get("modes", {}):
            new.setdefault("modes", {})[mode] = slot_from_files(repo, f"{base}-{mode}")
        slots["bases"][base] = new
    with open(os.path.join(gen, "slots.json"), "w", encoding="utf-8") as f:
        json.dump(slots, f, ensure_ascii=False, indent=2)
    print("done（そのあと bunx biome check --write src/features/map で JSON の書式をそろえる）")


def main():
    parser = argparse.ArgumentParser(description="島のレベル絵（lv1〜lv5）をマップに登録する")
    parser.add_argument("folder", nargs="?", help="lv1〜lv5 の絵を入れたフォルダ（--all のときは、島ごとのフォルダが入った親フォルダ）")
    parser.add_argument("base", nargs="?", help="差し替える土台の名前（例: base-01）。新しい名前なら土台が増える")
    parser.add_argument("--all", action="store_true",
                        help="親フォルダの中の「арал1」「island2」「島3」などを、番号の順に島1〜4の土台へ")
    parser.add_argument("--palette", choices=PALETTES, help="家の色。省略すると今の色のまま（新しい土台は pink）")
    parser.add_argument("--repo", default=".", help="リポジトリのルート（省略するといまのフォルダ）")
    parser.add_argument("--slots-only", action="store_true",
                        help="絵は作り直さず、保存してある土台の絵とマスクから家の位置（slots.json）だけ作り直す")
    args = parser.parse_args()
    if args.slots_only:
        rebuild_slots(args.repo)
        return
    if not args.folder:
        parser.error("folder を指定してください")

    if args.all:
        jobs, colored = [], {}
        for name in sorted(os.listdir(args.folder)):
            m = ISLAND_FOLDER.match(name)
            path = os.path.join(args.folder, name)
            if not os.path.isdir(path):
                continue
            if m and int(m.group(1)) >= 1:
                base, palette = island_base(int(m.group(1)))
                jobs.append((path, base, args.palette or palette))
            elif color_folder(name):
                color, mode = color_folder(name)
                colored.setdefault(color, {})[mode] = path
        for color, modes in sorted(colored.items(), key=lambda kv: COLOR_BASES[kv[0]]):
            jobs.append((modes, COLOR_BASES[color], args.palette))
        if not jobs:
            sys.exit(f"{args.folder} に島のフォルダ（арал1、бүдэг цэнхэр арал など）がありません")
    elif args.base and re.fullmatch(r"[a-z0-9-]+", args.base):
        jobs = [(args.folder, args.base, args.palette)]
    else:
        sys.exit("土台の名前（半角英数字とハイフン。例: base-01）を指定するか、--all を付けてください")

    gen = os.path.join(args.repo, "src", "features", "map", "generated")
    with open(os.path.join(gen, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    with open(os.path.join(gen, "slots.json"), encoding="utf-8") as f:
        slots = json.load(f)
    for folder, base, palette in jobs:
        build_island(folder, base, palette, args.repo, manifest, slots)
    with open(os.path.join(gen, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    with open(os.path.join(gen, "slots.json"), "w", encoding="utf-8") as f:
        json.dump(slots, f, ensure_ascii=False, indent=2)
    print("done（そのあと bunx biome check --write src/features/map で JSON の書式をそろえる）")


if __name__ == "__main__":
    main()
