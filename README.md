# 島マップ（ishinomaki2026）

アイドルファンのための、島のかたちをしたSNS。1グループ＝1島。島の家（タグ）をたどって、みんなの投稿を読み書きします。
計画は [docs/plan.md](docs/plan.md) を参照してください。

## すぐ動かす（Neon のキーなしで動きます）

```bash
bun install
bun run db:seed   # ローカルDB（PGlite、.pglite/）にシードを入れる
bun run dev       # http://localhost:3000
```

- `DATABASE_URL` が未設定なら、ローカルの PGlite を使います（起動時に自動でマイグレーションします）。
- アカウントはユーザー名とパスワードで作ります（外部サービス不要）。ツールバー左下の「ログイン」から登録できます。シードのユーザー（`seed_user_N`）ではログインできません。
- `db:seed` と `db:migrate` は、`bun run dev` を止めてから実行してください（PGlite は同時に1プロセスしか開けません）。

必要なもの: Node.js 24（`.nvmrc`）、Bun。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `bun run dev` / `build` / `start` | 開発サーバー / 本番ビルド / 本番起動 |
| `bun run lint` / `typecheck` | Biome / TypeScript |
| `bun run test` | 単体テスト（Vitest。DBは PGlite、UIは jsdom） |
| `bun run test:e2e` | E2E（Playwright。専用のPGlite `.pglite-e2e` を毎回作り直す） |
| `bun run db:generate` | スキーマ変更からマイグレーションSQLを生成（`drizzle/`） |
| `bun run db:migrate` | マイグレーションを適用（`DATABASE_URL` があればNeon、なければPGlite） |
| `bun run db:seed` | 開発用シード（島2・メンバー各5・話題タグ56・投稿500・ユーザー10）。何度実行しても同じ状態に戻る |

シードは、`DATABASE_URL` を設定しているときは `ALLOW_SEED_REMOTE=1` を付けないと実行できません（本番DBへの誤投入を防ぐため）。`NODE_ENV=production` では実行できません。

## 環境変数（[.env.example](.env.example)）

| 変数 | 必須 | 内容 |
| --- | --- | --- |
| `DATABASE_URL` | 本番で必須 | Neon の接続文字列。未設定ならローカルは PGlite |
| `PGLITE_DIR` | 任意 | PGlite の保存先（既定 `.pglite`） |

`next build` は環境変数が空でも通ります。本番サーバーの起動時（`instrumentation.ts`）に必須の変数を検証し、足りなければ全リクエストが失敗します。

## 画面とURL

`/` 世界地図＋全島タイムライン、`/i/[island]` 島、`/i/[island]/t/[tag]` 家（タグ）、`/u/[username]` プロフィール（推しグループと推しメンバー）、`/dev/islands` 島エディタ（ローカル専用。本番では404）。

島エディタ: 島の作成、世界地図上の位置とメンバー（広場の家）の位置をドラッグで調整。右側のプレビューは本番と同じ `MapCanvas`。保存すると `/` と島ビューにすぐ反映されます。

## アーティスト詳細

グループ（島）の投稿一覧 `/i/[island]` の写真ヘッダー右上にある「…」を押すと、アーティストプロフィールが直接開きます。ログインは不要です。閉じるボタン・Escape・背景のクリックで閉じると、元の投稿一覧のスクロール位置や入力内容、マップの状態を保ちます。スマートフォンでは全画面で表示します。

- 名前と説明は、現在のDBの `islands.name` / `islands.description` をそのまま表示します。説明の改行も保持し、空の場合は未登録の案内を表示します。
- 写真は既存の `public/photos/<島のslug>.jpg` を使い、写真がない場合は代替イラストを表示します。
- 世界地図、個別メンバー・話題タグの投稿一覧では、このプロフィールボタンを表示しません。
- 情報は詳細を開いたときに `/api/artists/[island]` から取得します。失敗した場合は画面から再試行できます。

Neonに登録済みの情報を表示するには、プロジェクト直下の `.env.local` の既存の `DATABASE_URL=` に、対象のNeon DBの接続文字列を設定して開発サーバーを再起動してください。アーティスト詳細専用の環境変数やAPIキーは不要です。この機能のためのマイグレーションやシードの再実行も不要です。

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"
```

`DATABASE_URL` が未設定ならローカルのPGliteを参照します。接続文字列は `.env.local` にのみ保存し、`NEXT_PUBLIC_` を付けず、Gitにコミットしないでください。

## デザイン切り替えの共通基盤

ツールバーの2つのデザインボタンで `cool` / `kawaii` の選択を切り替えます。cool は濃紺・アイスブルーと角の浅いカード、kawaii はクリーム・ローズと丸いカードを表示します。

- 選択は `localStorage` の `ishinomaki-design` に保存し、初回描画前に `<html data-design="cool|kawaii">` へ復元します。未保存・不正な値・保存不可の場合の初期値は `kawaii` です。
- 後から CSS の `[data-design="cool"]` / `[data-design="kawaii"]` にスタイルを追加できます。画像などの出し分けには `src/features/design/useDesign.ts` の `useDesign()` を使います。
- ページ移動や切り替えでマップを再マウントせず、別タブの選択変更も反映します。ストレージに保存できなくても、そのページ内の切り替えは利用できます。
- スイッチのない画面や非表示の画面から戻ったときも保存値を読み直します。遅れて届いた別タブの通知では最新の保存値を参照し、古い選択への巻き戻りを防ぎます。

## 公開までの手順（アカウントが必要な作業。まだ行っていません）

1. **Neon**: プロジェクトを作り、`main`（本番）と `dev` のブランチを用意する。
   - ローカルで dev ブランチを使うなら、`.env.local` に dev の `DATABASE_URL` を書き、`bun run db:migrate`。
   - 本番には、Vercel へ `DATABASE_URL`（main ブランチ）を設定し、公開前に手元から `DATABASE_URL=<main> bun run db:migrate` を1回実行する（7-4）。島は `/dev/islands` ではなく、DB を直接操作して追加する。
2. **Vercel**: このリポジトリをインポートする。Production に `DATABASE_URL`（Neon main）、Preview に `DATABASE_URL`（Neon dev）を設定する（0-4）。`main` への push で本番デプロイされる。

## 実装状況（計画のタスク）

| フェーズ | 状況 |
| --- | --- |
| 0 基盤 | 0-1〜0-3 完了。0-4 は CI（lint・型・テスト・ビルド・E2E）まで。**Vercel の設定は未実施** |
| 1 DB | 1-2〜1-4 完了。1-1 は Drizzle の設定とマイグレーションまで。**Neon のブランチ作成と適用は未実施** |
| 2 認証 | Clerk から自前認証（ユーザー名＋パスワード）へ置き換え済み。推しのプロフィールも完了（[docs/plan-account.md](docs/plan-account.md)） |
| 3 タイムラインと投稿 | 完了 |
| 4 マップ描画 | 完了 |
| 5 ズーム遷移 | 完了 |
| 6 島エディタ | 完了 |
| 7 仕上げ | 7-1、7-2 完了。7-3 は閲覧・島エディタ・アカウント（登録→推し→投稿・いいね・削除→ログアウト→ログイン）の E2E が通る。**7-4 リリースは未実施** |

## 計画からの変更・仮定

- **Next.js 16**: proxy（旧 middleware）は使わない（認証は各 Server Action / Route Handler の中で確認する）。`cacheComponents` は使わず、上位20件の5分キャッシュは `unstable_cache`。TypeScript は 7、Zod は 4。
- **キーなしで動く**: 計画の「必須の環境変数がないと起動時にエラー」は、本番ランタイムでのみ適用（ビルドと開発では緩い）。ローカルDBは PGlite。
- **DBの接続**: 読み取りと単一文の書き込みは Neon の HTTP ドライバ。`neon-http` は `transaction()` に対応しないため、トランザクションが必要な処理（投稿の作成、島エディタの保存、シード）だけ WebSocket ドライバ（`Pool`）を使う。
- **時刻は ミリ秒精度（`timestamptz(3)`）**: タイムラインのカーソル `(created_at, id)` を JS の `Date` で往復しても行が欠けないようにするため。
- **d3**: `d3-zoom`、`d3-interpolate`、`d3-zoom` が必要とする `d3-selection` だけ。`d3-transition` は使わず、`interpolateZoom` の経路を自前の `requestAnimationFrame`（650ms）で再生している。ユーザーが操作を始めたら自動の移動を止める。
- **無限スクロール**: IntersectionObserver ではなく、スクロール位置の監視（下端まで400px）。埋め込みブラウザなどで IntersectionObserver が発火しない環境があったため。「もっと見る」ボタンも残している。
- **戻る操作用に前のページが残る**: Next.js 16 は遷移前のページを非表示のまま保持するので、タイムラインは非表示のとき追加読み込みをしない。
- **存在しない島・タグのURL**: 見つからない画面は出るが、`loading.tsx` のストリーミングのためHTTPステータスは 200（`noindex` が付く）。
- **ハッシュタグ**: タグに使える文字は、文字・結合文字・数字・`_`（長音は文字）。`#` の直前は行頭・空白・記号で、タグ文字と `#` は不可。URL（`http(s)://`、`www.`）の中の `#` はタグにしない。「㌔」のように、正規化すると文字になる記号はタグ文字として扱わない。
- **表示名**: NFKC正規化した綴り（大文字・小文字は保つ）。URLと一意性には、ラテン文字だけ小文字にした `normalized_name` を使う。
- **認証**: パスワードは `node:crypto` の scrypt でハッシュ化。セッションは DB（`sessions`）に保存し、Cookie にはトークンを、DB にはその SHA-256 だけを置く。有効期限30日で、残り15日を切ると書き込み操作のときに延長する（描画中は Cookie を書けないため）。同じユーザー名で15分に10回ログインに失敗すると15分間拒否する。メールアドレスは持たないので、パスワードを忘れると復旧できない。
- **推し**: 推しメンバーは推しグループの島のメンバータグに限る（複合外部キー）。島エディタでメンバーから外すと推しからも外れる。
- **E2E**: 全テストが同じDBを使うので `workers: 1` で順番に実行する。Next.js の開発用インジケーターはツールバーのボタンと重ならないよう右上に出す。
- **いいね**: トグルではなく「望む状態」を送る（連打・再送しても結果が変わらない）。同じ投稿へのリクエストは1件ずつ順番に送る。
- **島エディタ**: メンバーを「外す」と話題タグに戻る（タグと投稿のひも付けは消さない）。メンバー名はタグとして有効な名前だけ。広場の外に置いた位置は縁に収める。Server Action でも開発環境かを確認する。
- **家の更新**: ランキングは5分キャッシュ。マップは5分ごとに `router.refresh()` で取り込み、順位が変わった家はスロットへ移動する。
- **シードのグループ・人物は全て架空**。

## ディレクトリ

`src/app`（ルート）、`src/features/*`（map / timeline / posts / tags / likes / users / islands / auth）、`src/db`（スキーマと接続）、`src/lib`、`scripts`（seed・migrate）、`drizzle`（マイグレーション）、`tests/unit`、`tests/e2e`。
