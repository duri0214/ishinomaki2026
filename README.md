# 島マップ（ishinomaki2026）

アイドルファンのための、島のかたちをしたSNS。1グループ＝1島。島の家（タグ）をたどって、みんなの投稿を読み書きします。
計画は [docs/plan.md](docs/plan.md) を参照してください。

## すぐ動かす（Neon・Clerk のキーなしで動きます）

```bash
bun install
bun run db:seed   # ローカルDB（PGlite、.pglite/）にシードを入れる
bun run dev       # http://localhost:3000
```

- `DATABASE_URL` が未設定なら、ローカルの PGlite を使います（起動時に自動でマイグレーションします）。
- Clerk のキーが未設定なら、ログイン・投稿・いいねは無効になり、閲覧だけできます。
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
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | 本番で必須 | Clerk のキー。未設定ならログイン無効 |
| `CLERK_WEBHOOK_SIGNING_SECRET` | 任意 | Webhook を登録してから設定。未設定のとき Webhook は 503 を返す |
| `PGLITE_DIR` | 任意 | PGlite の保存先（既定 `.pglite`） |

`next build` は環境変数が空でも通ります。本番サーバーの起動時（`instrumentation.ts`）に必須の変数を検証し、足りなければ全リクエストが失敗します。

## 画面とURL

`/` 世界地図＋全島タイムライン、`/i/[island]` 島、`/i/[island]/t/[tag]` 家（タグ）、`/dev/islands` 島エディタ（ローカル専用。本番では404）。

島エディタ: 島の作成、世界地図上の位置とメンバー（広場の家）の位置をドラッグで調整。右側のプレビューは本番と同じ `MapCanvas`。保存すると `/` と島ビューにすぐ反映されます。

## 公開までの手順（アカウントが必要な作業。まだ行っていません）

1. **Neon**: プロジェクトを作り、`main`（本番）と `dev` のブランチを用意する。
   - ローカルで dev ブランチを使うなら、`.env.local` に dev の `DATABASE_URL` を書き、`bun run db:migrate`。
   - 本番には、Vercel へ `DATABASE_URL`（main ブランチ）を設定し、公開前に手元から `DATABASE_URL=<main> bun run db:migrate` を1回実行する（7-4）。島は `/dev/islands` ではなく、DB を直接操作して追加する。
2. **Clerk**: アプリを作り、`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` と `CLERK_SECRET_KEY` を取得する。
   - 本番デプロイ後に、Webhook（`https://<ドメイン>/api/webhooks/clerk`、`user.created` / `user.updated` / `user.deleted`）を登録し、署名シークレットを `CLERK_WEBHOOK_SIGNING_SECRET` に設定する（2-3）。
   - E2E 用に、開発用インスタンスへテストユーザーを作る。
3. **Vercel**: このリポジトリをインポートする。Production に `DATABASE_URL`（Neon main）と Clerk の本番キー、Preview に `DATABASE_URL`（Neon dev）と Clerk の開発キーを設定する（0-4）。`main` への push で本番デプロイされる。
4. **GitHub Secrets**（ログイン後の E2E `tests/e2e/auth.spec.ts` を CI で動かす場合）: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`、`CLERK_SECRET_KEY`、`E2E_CLERK_USER_EMAIL`（Clerk 開発用インスタンスのもの）。未設定ならこのテストはスキップされる。

## 実装状況（計画のタスク）

| フェーズ | 状況 |
| --- | --- |
| 0 基盤 | 0-1〜0-3 完了。0-4 は CI（lint・型・テスト・ビルド・E2E）まで。**Vercel の設定は未実施** |
| 1 DB | 1-2〜1-4 完了。1-1 は Drizzle の設定とマイグレーションまで。**Neon のブランチ作成と適用は未実施** |
| 2 認証 | コードは完了（proxy、サインイン画面、ensureUser、Webhook）。署名検証つきの Webhook はテスト済み。**実際のログインは Clerk のキーがなく未確認** |
| 3 タイムラインと投稿 | 完了（ログインが必要な操作は、サービス層とUIをテストで確認。実ログインでの確認は上記のとおり未実施） |
| 4 マップ描画 | 完了 |
| 5 ズーム遷移 | 完了 |
| 6 島エディタ | 完了 |
| 7 仕上げ | 7-1、7-2 完了。7-3 は閲覧・島エディタの E2E が通る。**ログイン後の E2E は書いたが、キーがなく未実行**。**7-4 リリースは未実施** |

## 計画からの変更・仮定

- **Next.js 16**: `middleware` ではなく `proxy.ts`。`cacheComponents` は使わず、上位20件の5分キャッシュは `unstable_cache`。TypeScript は 7、Zod は 4。
- **キーなしで動く**: 計画の「必須の環境変数がないと起動時にエラー」は、本番ランタイムでのみ適用（ビルドと開発では緩い）。ローカルDBは PGlite、Clerk は未設定なら無効（`ClerkProvider` と proxy を使わない）。
- **DBの接続**: 読み取りと単一文の書き込みは Neon の HTTP ドライバ。`neon-http` は `transaction()` に対応しないため、トランザクションが必要な処理（投稿の作成、島エディタの保存、シード）だけ WebSocket ドライバ（`Pool`）を使う。
- **時刻は ミリ秒精度（`timestamptz(3)`）**: タイムラインのカーソル `(created_at, id)` を JS の `Date` で往復しても行が欠けないようにするため。
- **d3**: `d3-zoom`、`d3-interpolate`、`d3-zoom` が必要とする `d3-selection` だけ。`d3-transition` は使わず、`interpolateZoom` の経路を自前の `requestAnimationFrame`（650ms）で再生している。ユーザーが操作を始めたら自動の移動を止める。
- **無限スクロール**: IntersectionObserver ではなく、スクロール位置の監視（下端まで400px）。埋め込みブラウザなどで IntersectionObserver が発火しない環境があったため。「もっと見る」ボタンも残している。
- **戻る操作用に前のページが残る**: Next.js 16 は遷移前のページを非表示のまま保持するので、タイムラインは非表示のとき追加読み込みをしない。
- **存在しない島・タグのURL**: 見つからない画面は出るが、`loading.tsx` のストリーミングのためHTTPステータスは 200（`noindex` が付く）。
- **ハッシュタグ**: タグに使える文字は、文字・結合文字・数字・`_`（長音は文字）。`#` の直前は行頭・空白・記号で、タグ文字と `#` は不可。URL（`http(s)://`、`www.`）の中の `#` はタグにしない。「㌔」のように、正規化すると文字になる記号はタグ文字として扱わない。
- **表示名**: NFKC正規化した綴り（大文字・小文字は保つ）。URLと一意性には、ラテン文字だけ小文字にした `normalized_name` を使う。
- **ユーザーの作成**: 初回の投稿・いいねで `ensureUser` が `users` の行を作る。Webhook は更新と退会（論理削除。投稿は残り、作者は「退会したユーザー」と表示）を反映する。
- **いいね**: トグルではなく「望む状態」を送る（連打・再送しても結果が変わらない）。同じ投稿へのリクエストは1件ずつ順番に送る。
- **島エディタ**: メンバーを「外す」と話題タグに戻る（タグと投稿のひも付けは消さない）。メンバー名はタグとして有効な名前だけ。広場の外に置いた位置は縁に収める。Server Action でも開発環境かを確認する。
- **家の更新**: ランキングは5分キャッシュ。マップは5分ごとに `router.refresh()` で取り込み、順位が変わった家はスロットへ移動する。
- **シードのグループ・人物は全て架空**。

## ディレクトリ

`src/app`（ルート）、`src/features/*`（map / timeline / posts / tags / likes / users / islands / auth）、`src/db`（スキーマと接続）、`src/lib`、`scripts`（seed・migrate）、`drizzle`（マイグレーション）、`tests/unit`、`tests/e2e`。
