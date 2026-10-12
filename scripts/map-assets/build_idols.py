"""アイドル（メンバー）の絵を、島の中央の広場のアイコン用に変換して登録する。

使い方:
  py scripts/map-assets/build_idols.py <アイドルの絵のフォルダ> [--repo リポジトリのルート]
  例: py scripts/map-assets/build_idols.py "../../Island design/アイドルの絵"

フォルダの形（アイドル写真.zip と同じ。member フォルダはなくてもよい）:
  <フォルダ>/<グループ名>/member/<メンバー名>.png
  <フォルダ>/<グループ名>/<メンバー名>.png
  - グループ名は島の名前と同じにする。大文字・小文字、記号、空白の違いは無視する
    （「M!lk」と「M!LK」、「FRUITS ZIPPER」と「FRUITSZIPPER」は同じ）。島の slug でもよい
  - メンバー名はシード・島エディタのメンバー名と同じにする（ファイル名がそのままメンバー名）
  - group_image / group_logo フォルダは使わない
  - png / jpg / jpeg / webp（avif は Pillow が対応していれば）。正方形でなくてもよい（顔が入るよう、上寄りの正方形に切り抜く）

やること:
  1. 正方形 256px の WebP にして public/map/idols/<グループのキー>/<番号>.webp に保存する
  2. manifest.json の idols[グループのキー][メンバーのキー] に登録する（build_assets.py をやり直しても消えない）
     見つかったグループは丸ごと入れ替える（絵を消したメンバーは、頭文字のアイコンに戻る）
  3. マップでは、メンバーの画像（DB の tags.image_url）がなければこの絵を丸く切り抜いて使う
"""
import argparse, hashlib, json, os, shutil, sys, unicodedata
from PIL import Image, ImageOps

EXTS = (".png", ".jpg", ".jpeg", ".webp", ".avif")
SKIP_DIRS = {"group_image", "group_logo"}
SIZE = 256


def asset_key(name):
    """グループ名・メンバー名 → 素材のキー（src/features/map/assets.ts の assetKey と同じ規則）"""
    s = unicodedata.normalize("NFKC", name).lower()
    return "".join(ch for ch in s if unicodedata.category(ch)[0] in ("L", "N"))


def member_files(group_dir):
    """グループのフォルダから (メンバー名, パス) を集める（member フォルダがあればその中）"""
    src = os.path.join(group_dir, "member")
    if not os.path.isdir(src):
        src = group_dir
    out = []
    for name in sorted(os.listdir(src)):
        path = os.path.join(src, name)
        stem, ext = os.path.splitext(name)
        if os.path.isfile(path) and ext.lower() in EXTS:
            out.append((unicodedata.normalize("NFC", stem).strip(), path))
    return out


def square(img):
    """上寄りの正方形に切り抜いて SIZE px にする（縦長の写真や絵でも顔が入るように）"""
    img = ImageOps.exif_transpose(img).convert("RGBA")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = int((h - side) * 0.2)
    return img.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", help="グループごとのフォルダが入ったフォルダ")
    parser.add_argument("--repo", default=".", help="リポジトリのルート（省略するといまのフォルダ）")
    args = parser.parse_args()

    manifest_path = os.path.join(args.repo, "src", "features", "map", "generated", "manifest.json")
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    idols = manifest.setdefault("idols", {})
    public = os.path.join(args.repo, "public", "map", "idols")

    groups = [d for d in sorted(os.listdir(args.folder))
              if os.path.isdir(os.path.join(args.folder, d)) and d not in SKIP_DIRS]
    if not groups:
        sys.exit(f"{args.folder} にグループのフォルダがありません")
    for group in groups:
        files = member_files(os.path.join(args.folder, group))
        if not files:
            continue
        gkey = asset_key(unicodedata.normalize("NFC", group))
        out_dir = os.path.join(public, gkey)
        shutil.rmtree(out_dir, ignore_errors=True)
        os.makedirs(out_dir, exist_ok=True)
        entry = {}
        for member, path in files:
            try:
                img = square(Image.open(path))
            except Exception as e:  # noqa: BLE001  avif など、読めない形式は飛ばす
                print(f"  skip {path}: {e}")
                continue
            mkey = asset_key(member)
            # ファイル名は番号（日本語の名前を URL に入れない）。?v= は絵を差し替えたときにブラウザの古い絵を使わないため
            num = hashlib.md5(mkey.encode("utf-8")).hexdigest()[:10]
            out = os.path.join(out_dir, f"{num}.webp")
            img.save(out, "WEBP", quality=85, method=4)
            with open(out, "rb") as f:
                ver = hashlib.md5(f.read()).hexdigest()[:8]
            entry[mkey] = f"/map/idols/{gkey}/{num}.webp?v={ver}"
        idols[gkey] = entry
        print(f"{group} → {gkey}: {len(entry)}人 ({', '.join(m for m, _ in files)})")

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("done（そのあと bunx biome check --write src/features/map で JSON の書式をそろえる）")


if __name__ == "__main__":
    main()
