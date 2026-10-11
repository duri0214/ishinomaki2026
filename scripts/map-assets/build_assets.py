"""デザイン用画像.zip から、マップ用の WebP と manifest.json を作る"""
import io, json, os, sys, zipfile
import numpy as np
from PIL import Image

ISLAND_SIZE = 690  # layout.ts の ISLAND_RADIUS * 2
MAX_PX = {"house": 512, "tree": 448, "stage": 512, "castle": 768, "penlight": 256}

# 島の土台（モード共通）と、その島の色
BASES = {
    "base-01": {"src": "cool/島土台/base-01.png", "palette": "blue"},
    "base-03": {"src": "cool/島土台/base-03.png", "palette": "green"},
    "base-05": {"src": "kawaii/島土台/base-03.png", "palette": "pink"},
    "base-07": {"src": "kawaii/島土台/Empty pastel terraced floating island-13.png", "palette": "purple"},
}

# 島の色。hue＝塗り替える色相(度)、sat＝彩度の倍率、
# pick＝使う元画像の番号（1始まり。書いていない役割は1番を使う）
PALETTES = {
    "blue": {"hue": 212, "sat": 1.0, "pick": {
        "cool": {"tree": 1, "stage": 1, "castle": 1, "penlight": 1},
        "kawaii": {"tree": 2, "stage": 1, "castle": 1, "penlight": 2}}},
    "green": {"hue": 150, "sat": 0.9, "pick": {
        "cool": {"tree": 3, "stage": 3, "castle": 3, "penlight": 3},
        "kawaii": {"tree": 4, "stage": 3, "castle": 3, "penlight": 2}}},
    "pink": {"hue": 340, "sat": 0.75, "pick": {
        "cool": {"tree": 4, "stage": 2, "castle": 2, "penlight": 2},
        "kawaii": {"tree": 5, "stage": 2, "castle": 2, "penlight": 1}}},
    "purple": {"hue": 272, "sat": 0.85, "pick": {
        "cool": {"tree": 2, "stage": 2, "castle": 2, "penlight": 2},
        "kawaii": {"tree": 2, "stage": 1, "castle": 1, "penlight": 5}}},
}

# モードごとのスプライト（ステージ＝小さい城、城＝大きい城）
SPRITES = {
    "cool": {
        "house-member": ["cool/家/house-01-member.png"],
        "house-cafe": ["cool/家/house-02-cafe.png"],
        "house-music": ["cool/家/house-03-music.png"],
        "house-shop": ["cool/家/house-04-shop.png"],
        "house-cottage": ["cool/家/house-05-cottage.png"],
        "tree": [f"cool/桜/sakura-0{i}.png" for i in range(1, 6)],
        "penlight": [
            "cool/ペンライト/penlight-03-cool.png",
            "cool/ペンライト/penlight-04-cool.png",
            "cool/ペンライト/penlight-05-universal.png",
        ],
        "stage": [f"cool/ステージ/small/castle-0{i}.png" for i in range(1, 4)],
        "castle": [f"cool/ステージ/large/castle-0{i}.png" for i in range(1, 4)],
    },
    "kawaii": {
        "house-member": ["kawaii/家/house-01-member.png"],
        "house-cafe": ["kawaii/家/house-02-cafe.png"],
        "house-music": ["kawaii/家/house-03-music.png"],
        "house-shop": ["kawaii/家/house-04-shop.png"],
        "house-cottage": ["kawaii/家/house-05-cottage.png"],
        "tree": [
            "kawaii/桜/Cozy Apricot Sakura Tree Sprite-14.png",
            "kawaii/桜/Crystal sakura tree sprite-16.png",
            "kawaii/桜/Lavender Gothic Sakura Tree Sprite-12.png",
            "kawaii/桜/Mint-Pearl Sakura Tree Sprite-15.png",
            "kawaii/桜/Rose quartz sakura tree sprite-11.png",
            "kawaii/桜/sakura-04.png",
        ],
        "penlight": [
            "kawaii/ペンライト/Blush Art Nouveau Concert Penlight-5.png",
            "kawaii/ペンライト/Crystal blue concert penlight-8.png",
            "kawaii/ペンライト/Peach and gold concert penlight-10.png",
            "kawaii/ペンライト/penlight-01-kawaii.png",
            "kawaii/ペンライト/penlight-02-kawaii.png",
        ],
        "stage": [f"kawaii/ステージ/small/castle-0{i}.png" for i in range(1, 4)],
        "castle": [f"kawaii/ステージ/large/castle-0{i}.png" for i in range(1, 4)],
    },
}


def open_zip(path) -> tuple[zipfile.ZipFile, dict]:
    """zip を開き、(zip, {正しいファイル名: ZipInfo}) を返す（cp437 → utf-8 に直す）"""
    zf = zipfile.ZipFile(path)          # zip を開く
    names = {}                          # {ファイル名: ZipInfo}
    for info in zf.infolist():          # zip の中のファイルを1つずつ見る
        name = info.filename
        if not info.flag_bits & 0x800:  # UTF-8 フラグがない ＝ 名前が文字化けしている
            name = name.encode("cp437").decode("utf-8")  # 正しい日本語に戻す
        names[name] = info
    return zf, names


def load(zf, names, rel) -> Image.Image:
    """'デザイン用画像/' + rel を RGBA で読む"""
    info = names["デザイン用画像/" + rel]      # 正しい名前から ZipInfo を探す
    data = zf.read(info)                       # zip から中身（bytes）を取り出す
    return Image.open(io.BytesIO(data)).convert("RGBA")  # 画像として開く（透明度つき）


def crop_and_anchor(img) -> tuple[Image.Image, list[float]]:
    """透明な余白を切り取り（alpha>8, 余白4px）、接地点（alpha>128 の下中央, 0〜1）を返す"""
    # 1) 切り取り: 少しでも見えている部分（alpha>8）を囲む四角形
    a = np.array(img.getchannel("A"))       # 透明度だけを数値の表にする（0=透明, 255=不透明）
    ys, xs = np.where(a > 8)                # 見えている画素の y 座標と x 座標
    pad = 4
    x0 = max(0, xs.min() - pad)
    y0 = max(0, ys.min() - pad)
    x1 = min(img.width, xs.max() + 1 + pad)
    y1 = min(img.height, ys.max() + 1 + pad)
    cropped = img.crop((x0, y0, x1, y1))

    # 2) 接地点: しっかり見えている部分（alpha>128）の下端の中央
    ca = np.array(cropped.getchannel("A"))
    oys, oxs = np.where(ca > 128)
    cx = (oxs.min() + oxs.max()) / 2        # 左右の中央
    bottom = oys.max() + 1                  # 下端
    anchor = [round(float(cx / cropped.width), 4), round(float(bottom / cropped.height), 4)]
    return cropped, anchor


def resize_max(img, limit) -> Image.Image:
    """長い辺が limit を超えるときだけ LANCZOS で縮小する"""
    scale = limit / max(img.size)          # 長い辺を limit にする倍率
    if scale >= 1:
        return img                          # すでに小さいので、そのまま
    size = (round(img.width * scale), round(img.height * scale))
    return img.resize(size, Image.LANCZOS)  # LANCZOS ＝ 縮小してもきれいな方式


def recolor(img, hue_deg, sat_mul) -> Image.Image:
    """屋根や壁などの色だけを hue_deg の色相に塗り替える（陰影・質感は残す）"""
    alpha = np.array(img.getchannel("A"))
    hsv = np.array(img.convert("RGB").convert("HSV")).astype(float)
    h = hsv[..., 0] * 360 / 255             # Pillow の色相 0〜255 を 0〜360度 にする
    s, v = hsv[..., 1], hsv[..., 2]
    warm = (h >= 15) & (h <= 65) & (v > 150)  # 窓の明かり・金の飾り（明るい黄〜橙）は残す
    leaf = (h >= 70) & (h <= 165) & (s > 60)  # 草・葉っぱは残す
    target = (s > 25) & ~warm & ~leaf         # それ以外の色がついている部分を塗り替える
    hsv[..., 0] = np.where(target, hue_deg / 360 * 255, hsv[..., 0])
    hsv[..., 1] = np.where(target, np.clip(s * sat_mul, 0, 255), s)
    out = Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")
    out.putalpha(Image.fromarray(alpha))    # 透明度は元のまま
    return out


def main():
    zip_path, repo = sys.argv[1], sys.argv[2]
    manifest = {"islandSize": ISLAND_SIZE, "bases": {}, "modes": {}}
    zf, names = open_zip(zip_path)
    public = os.path.join(repo, "public", "map")

    # 1) 土台: 切り取らずに、そのまま WebP で保存する（配置の座標がキャンバス基準のため）
    os.makedirs(os.path.join(public, "base"), exist_ok=True)
    for name, base in BASES.items():
        img = load(zf, names, base["src"])
        img.save(os.path.join(public, "base", f"{name}.webp"), "WEBP", quality=82, method=4)
        manifest["bases"][name] = {
            "src": f"/map/base/{name}.webp",
            "width": img.width,
            "height": img.height,
            "palette": base["palette"],
        }
        print("base", name)

    # 2) スプライト: モード × 島の色 × 役割 ごとに1枚ずつ作る
    cache = {}  # 同じ元画像を何度も切り取らないため
    for mode, roles in SPRITES.items():
        manifest["modes"][mode] = {}
        for palette, pal in PALETTES.items():
            out_dir = os.path.join(public, mode, palette)
            os.makedirs(out_dir, exist_ok=True)
            manifest["modes"][mode][palette] = {}
            for role, rels in roles.items():
                key = "house" if role.startswith("house") else role  # MAX_PX のキー
                rel = rels[pal["pick"][mode].get(role, 1) - 1]
                if rel not in cache:
                    sprite, anchor = crop_and_anchor(load(zf, names, rel))
                    cache[rel] = (resize_max(sprite, MAX_PX[key]), anchor)
                sprite, anchor = cache[rel]
                sprite = recolor(sprite, pal["hue"], pal["sat"])
                sprite.save(os.path.join(out_dir, f"{role}.webp"), "WEBP", quality=82, method=4)
                manifest["modes"][mode][palette][role] = {
                    "src": f"/map/{mode}/{palette}/{role}.webp",
                    "width": sprite.width,
                    "height": sprite.height,
                    "anchor": anchor,
                }
            print(mode, palette)

    # 3) manifest.json を保存する（TypeScript から import して使う）
    out_dir = os.path.join(repo, "src", "features", "map", "generated")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("done")


if __name__ == "__main__":
    main()