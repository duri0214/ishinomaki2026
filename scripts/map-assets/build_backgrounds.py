"""マップの背景の絵（かわいい / かっこいい）を登録する。

使い方:
  py scripts/map-assets/build_backgrounds.py <背景の絵のフォルダ、または絵のファイル…> [--repo リポジトリのルート]
  例: py scripts/map-assets/build_backgrounds.py "../../Island design/デザイン用画像/デザイン用画像/background"
      py scripts/map-assets/build_backgrounds.py kawaii.png cool.jpg

  - ファイル名か、そのすぐ上のフォルダ名に kawaii / cool（かわいい / かっこいい）が入っている絵を、そのモードの背景にする
    例: background/kawaii.png, background/cool.jpg, kawaii/background.png
  - 片方のモードの絵しかなければ、そのモードだけ差し替わる（もう片方は今のまま）
  - png / jpg / jpeg / webp。横長（16:9 くらい）が望ましい。画面いっぱいに広げて、はみ出す端は切れる

やること:
  1. 長い辺 2400px までの WebP にして public/map/background/<モード>.webp に保存する
  2. manifest.json の backgrounds[モード] に登録する（build_assets.py をやり直しても消えない）
  3. マップでは、背景の絵があれば海の色と波の模様の代わりにこの絵を使う
"""
import argparse, hashlib, json, os, sys, unicodedata
from PIL import Image, ImageOps

EXTS = (".png", ".jpg", ".jpeg", ".webp")
MAX_PX = 2400
WORDS = {
    "kawaii": ("kawaii", "kawai", "かわいい", "カワイイ", "cute"),
    "cool": ("cool", "かっこいい", "カッコイイ"),
}


def mode_of(path):
    """ファイル名か、すぐ上のフォルダ名からモードを決める（決まらなければ None）"""
    name = unicodedata.normalize("NFKC", os.path.basename(path)).lower()
    parent = unicodedata.normalize("NFKC", os.path.basename(os.path.dirname(path))).lower()
    for text in (name, parent):
        hits = [m for m, words in WORDS.items() if any(w in text for w in words)]
        if len(hits) == 1:
            return hits[0]
    return None


def collect(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            for root, _, names in os.walk(p):
                files += [os.path.join(root, n) for n in sorted(names)]
        else:
            files.append(p)
    found = {}
    for f in files:
        if os.path.splitext(f)[1].lower() not in EXTS:
            continue
        mode = mode_of(f)
        if mode is None:
            print(f"  skip {f}（名前に kawaii / cool がない）")
        elif mode in found:
            print(f"  skip {f}（{mode} は {found[mode]} を使う）")
        else:
            found[mode] = f
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="+", help="背景の絵のフォルダ、または絵のファイル")
    parser.add_argument("--repo", default=".", help="リポジトリのルート（省略するといまのフォルダ）")
    args = parser.parse_args()

    found = collect(args.paths)
    if not found:
        sys.exit("背景の絵が見つかりません（ファイル名かフォルダ名に kawaii / cool を入れてください）")
    manifest_path = os.path.join(args.repo, "src", "features", "map", "generated", "manifest.json")
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    out_dir = os.path.join(args.repo, "public", "map", "background")
    os.makedirs(out_dir, exist_ok=True)
    backgrounds = manifest.setdefault("backgrounds", {})
    for mode, path in sorted(found.items()):
        img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        img.thumbnail((MAX_PX, MAX_PX), Image.LANCZOS)
        out = os.path.join(out_dir, f"{mode}.webp")
        img.save(out, "WEBP", quality=82, method=4)
        with open(out, "rb") as f:
            ver = hashlib.md5(f.read()).hexdigest()[:8]
        # ?v= は絵を差し替えたときに、ブラウザが古い絵を使わないため
        backgrounds[mode] = f"/map/background/{mode}.webp?v={ver}"
        print(f"{mode}: {path} → {out} ({img.width}x{img.height})")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("done（そのあと bunx biome check --write src/features/map で JSON の書式をそろえる）")


if __name__ == "__main__":
    main()
