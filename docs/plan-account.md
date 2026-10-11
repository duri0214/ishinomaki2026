# 実装計画: アカウント機能（自前認証＋推しプロフィール）

最終更新: 2026-10-11

## 0. 決定事項のまとめ

| 項目 | 決定 |
| --- | --- |
| 認証方式 | ユーザー名＋パスワード。Clerk は使わず、自前で実装する |
| 既存の Clerk ユーザー | 本番にはいない。`clerk_user_id` 列は削除し、移行処理は作らない |
| パスワードを忘れたとき | 復旧手段は用意しない（メールアドレスを持たないため）。登録画面にその旨を明記する |
| ユーザー名 | 半角英数字と `_`、3〜20文字。大文字・小文字を区別せずに一意。`seed_` で始まる名前は予約（シード用） |
| 表示名 | ユーザー名とは別に持つ。1〜50文字、日本語可。初期値はユーザー名 |
| パスワード | 8文字以上、128文字以下 |
| 登録を促す画面 | モーダル。「新規登録」と「ログイン」をタブで切り替える |
| モーダルを開くきっかけ | ツールバー末尾（PCでは左下）のボタン、未ログインでの投稿・いいね |
| 登録後の流れ | 2ステップ目で推しを設定する（スキップ可）。終わったら元の画面に戻るだけで、中断した操作は再実行しない |
| ログアウト | ツールバー末尾のアカウントメニューから |
| 推しグループ | 島（グループ）を複数選べる |
| 推しメンバー | 推しグループごとに複数選べる。選んだ島の `kind = 'member'` のタグに限る |
| プロフィール | `/u/[username]`（`(main)` 内なのでマップは常駐したまま）。本人のときだけ編集できる |
| 投稿カード | 推しは表示しない。作者名は `/u/[username]` へのリンクにする |
| 範囲外 | 退会、パスワード変更、パスワードリセット、アバター画像、ユーザー名の変更 |
| ログイン試行の制限 | 同じユーザー名で15分間に10回失敗したら、15分間ログインを受け付けない |
| 閲覧のみモード | 廃止する。認証に外部キーが要らなくなったため、常にログインできる |

## 1. 認証の設計

### パスワード

- `node:crypto` の `scrypt` でハッシュ化する（追加の依存パッケージなし）。パラメータは `N=2^14, r=8, p=1`、鍵長64バイト、ソルト16バイト。
- 保存形式は `scrypt$<N>$<r>$<p>$<salt(base64)>$<hash(base64)>`。パラメータを文字列に含めるので、後で強度を上げても古いハッシュを検証できる。
- 照合は `timingSafeEqual` で行う。存在しないユーザー名でもダミーのハッシュ計算を行い、応答時間でユーザー名の有無が分からないようにする。

### セッション

- ログイン時に32バイトのランダムなトークンを作り、Cookie `session` に入れる。DB の `sessions.id` にはトークンの SHA-256 だけを保存する（DB が漏れてもトークンは復元できない）。
- Cookie は `httpOnly`、`sameSite: "lax"`、`path: "/"`、`maxAge: 30日`。`secure` は本番だけ有効にする（ローカルの http でも動かすため）。
- 有効期限は30日。Next.js では描画中に Cookie を書けない（`cookies().set` は Server Function か Route Handler でしか呼べない）ので、期限の延長は Server Action の中（`requireUser()`）で行う。残りが15日を切っていたら、DB の `expires_at` と Cookie を30日先へ延ばす。
- ログアウトでは DB の行を消し、Cookie を削除する。
- 退会済み（`users.deleted_at` あり）のユーザーのセッションは無効として扱う。
- `proxy.ts` は削除する。ルートの保護はこれまでどおり、各 Server Action と Route Handler の中で行う。

### サーバー側の関数（`src/lib/auth.ts` を置き換える）

| 関数 | 役割 |
| --- | --- |
| `getSession()` | Cookie のトークンから有効なセッションとユーザーを返す。なければ null。React の `cache()` で1リクエスト1回にする |
| `getViewer()` | 閲覧者の `{ id, username, displayName }` か null。レイアウトとページで使う |
| `getViewerId()` | 既存の呼び出し元（タイムラインの `likedByMe` 判定など）向けに残す |
| `requireUser()` | 書き込み系で使う。未ログインなら `unauthorized`。セッションの期限延長もここで行う |

`ensureUserFor` と `displayNameFromClerk` は不要になる。`users` の行は登録時に作られる。

### Server Actions（`src/features/auth/actions.ts`）

既存と同じく `runAction` で包み、`ActionResult` を返す。

| Action | 入力 | 処理 |
| --- | --- | --- |
| `signUpAction` | username, password | 検証 → 重複確認（大文字・小文字を区別しない）→ `users` を作成 → セッション発行 |
| `signInAction` | username, password | 試行制限の確認 → 照合 → 失敗なら記録、成功なら失敗記録を消してセッション発行 |
| `signOutAction` | なし | セッション削除と Cookie 削除 |

ユーザー名が使われているときと、ログインに失敗したときのエラーは、`AppError` のコードを新しく追加して返す。同じ名前の登録が同時に来た場合は、事前の重複確認をすり抜けて一意インデックスの違反（PostgreSQL の 23505）になるので、これも「使われているユーザー名」のエラーに変換する（`internal` にしない）。ログイン失敗は「ユーザー名かパスワードが違います」とだけ伝え、どちらが違うかは出さない。

## 2. 画面

### 認証モーダル（`src/features/auth/AuthDialog.tsx`）

- `<dialog>` 要素と `showModal()` で作る。フォーカスの閉じ込めと Esc で閉じる動作をブラウザに任せる。
- `ViewerProvider` と同じ場所に `AuthDialogProvider` を置き、どこからでも `useAuthDialog().open({ mode, reason })` で開けるようにする。`reason` はモーダル上部の一文（例:「いいねするにはアカウントが必要です」）。
- タブ: 「新規登録」と「ログイン」。
  - 新規登録: ユーザー名、パスワード。下に「パスワードを忘れると復旧できません」と表示する。
  - ログイン: ユーザー名、パスワード。
- 成功したら `router.refresh()` と `queryClient.invalidateQueries({ queryKey: ["timeline"] })` を呼び、`likedByMe` と自分の投稿の削除ボタンを反映させる。
- 新規登録が成功したら、同じモーダルで2ステップ目「推しを選ぶ」に進む（3章の編集UIを再利用）。「あとで」で閉じられる。

### ツールバー（`src/features/layout/Toolbar.tsx`）

- 末尾のボタンを `AccountButton`（クライアントコンポーネント）に置き換える。
  - 未ログイン: 「ログイン」ボタン。押すと認証モーダルを「新規登録」タブで開く。
  - ログイン中: 表示名の頭文字のボタン。押すとメニューを開き、「プロフィール」（`/u/[username]`）と「ログアウト」を出す。
- Clerk の `Show` と `UserButton`、「閲覧のみ」の表示は削除する。

### 未ログインでの操作

| 場所 | 変更 |
| --- | --- |
| `Composer` | 未ログイン時の「ログインすると投稿やいいねができます」のリンクを、モーダルを開くボタンに替える |
| `LikeButton` | `/sign-in` への移動をやめ、モーダルを開く。サーバーから `unauthorized` が返ったとき（セッション切れ）も同じ |

### 削除するもの

`/sign-in` と `/sign-up` のページ、`AuthDisabledNotice`、Webhook のルート `/api/webhooks/clerk`。

## 3. プロフィールと推し

### ページ `/u/[username]`（`src/app/(main)/u/[username]/page.tsx`）

- ユーザー名は大文字・小文字を区別せずに探す。見つからない、または退会済みなら `notFound()`。
- 表示内容: 表示名、`@username`、推しグループ（島へのリンク）と、その下に推しメンバー（`/i/[island]/t/[member]` へのリンク）。何も設定していなければ「推しはまだ設定されていません」。
- 本人が見ているときは「編集」ボタンを出す。押すと同じ場所が編集フォームに替わる。
- `generateMetadata` でタイトルを「表示名（@username）」にする。

### 編集フォーム（`src/features/profile/ProfileEditor.tsx`）

- 表示名の入力欄。
- 島の一覧をチェックボックスで出す。チェックした島の下に、その島のメンバーをチップで並べ、複数選べる。
- 保存は `updateProfileAction({ displayName, favorites: { islandSlug, memberTagIds[] }[] })`。サーバーでは次をすべて検証し、1トランザクションで全置き換えする。
  - 島が存在する。
  - 各メンバーのタグが、その島の `kind = 'member'` のタグである。
- 登録直後の2ステップ目でも同じフォームを使う（表示名の欄も出す）。

### 投稿カード

`TimelinePost.author` に `username` を追加し、`PostCard` の作者名を `/u/[username]` へのリンクにする。退会済みのユーザーはリンクにしない。

## 4. データモデル

```
users（変更）
  - clerk_user_id                  削除
  + username text NOT NULL         入力どおりの表記で保存
  + password_hash text NOT NULL
  UNIQUE INDEX users_username_lower_uq ON lower(username)
  （display_name, avatar_url, created_at, updated_at, deleted_at はそのまま。avatar_url は今回は使わない）

sessions（新規）
  id text PK                       トークンの SHA-256（hex）
  user_id uuid FK→users ON DELETE CASCADE
  created_at, expires_at
  INDEX(user_id)

login_attempts（新規。失敗したログインの記録）
  id uuid PK
  username_lower text
  created_at
  INDEX(username_lower, created_at)

user_favorite_islands（新規）
  user_id FK→users ON DELETE CASCADE
  island_id FK→islands ON DELETE CASCADE
  created_at
  PK(user_id, island_id)

user_favorite_members（新規）
  user_id, island_id, tag_id, created_at
  PK(user_id, tag_id)
  FK(user_id, island_id) → user_favorite_islands ON DELETE CASCADE   -- 推しグループから外すとメンバーも消える
  FK(tag_id, island_id) → tags(id, island_id) ON DELETE CASCADE      -- メンバーが選んだ島に属することを DB で保証する

tags（変更）
  + UNIQUE(id, island_id)          上の複合外部キーのため
```

- `kind = 'member'` であることは外部キーでは表せないので、`updateProfileAction` で検証する。
- タグの行が消えたとき（島ごと削除したときなど）は、外部キーの CASCADE で推しからも外れる。
- 島エディタ（`src/features/islands/admin.ts`）は、メンバーから外したタグを削除せず `kind = 'topic'` に戻す（`post_tags` が参照しているため）。この場合は外部キーが働かないので、同じトランザクションで `user_favorite_members` の該当行も消す。念のため、プロフィールの読み込みでも `kind = 'member'` で絞る。
- `login_attempts` の古い行（1日以上前）は、記録するたびに一緒に消す。

### マイグレーション

本番に Clerk ユーザーはいないが、ローカルと Neon の `dev` ブランチにはシードのユーザーがいるので、次の順で列を入れ替える。

1. `username` と `password_hash` を NULL 可で追加する。
2. 既存の行を埋める。`password_hash` は `'!'`（どのパスワードとも一致しない値）にする。`username` は次のとおり。
   - シードのユーザー（`clerk_user_id` が `seed_user_` で始まる行）は `clerk_user_id` をそのまま使う。こうしないと、次のシード実行で古い行が `seed_` の接頭辞で見つからずに残り、同じ固定 UUID で入れ直そうとして主キーが衝突する。
   - それ以外の行は `'user_' || 先頭8文字のid`。
3. NOT NULL にして、一意インデックスを作り、`clerk_user_id` を削除する。

drizzle-kit はこの3段階の埋め込みを生成できないので、`drizzle-kit generate --custom` で空のマイグレーションを作って SQL を手で書く（スキーマ定義側は通常どおり `schema.ts` を更新する）。`lower(username)` の一意インデックスは `uniqueIndex("users_username_lower_uq").on(sql\`lower(${t.username})\`)` で定義する。

適用後に `bun run db:seed` を流せば、シードのユーザーは新しい形式で作り直される。

## 5. Clerk の撤去

| 対象 | 変更 |
| --- | --- |
| `src/proxy.ts` | 削除 |
| `src/app/layout.tsx` | `ClerkProvider` を外す |
| `src/app/(main)/layout.tsx` | `getClerkUserId` と `isClerkConfigured` をやめ、`getViewer()` の結果を `ViewerProvider` に渡す |
| `src/features/auth/viewer.tsx` | `authEnabled` と Clerk の `useAuth` を削除する。`{ signedIn, user }` を持つ単純な Context にする |
| `src/features/users/service.ts`, `sync.ts` | Clerk 由来の関数を削除する。`sync.ts` はファイルごと削除 |
| `src/app/api/webhooks/clerk/`, `src/app/sign-in/`, `src/app/sign-up/`, `AuthDisabledNotice.tsx` | 削除 |
| `src/lib/env.ts` | Clerk の3変数と `isClerkConfigured` を削除する。本番の必須変数は `DATABASE_URL` だけになる |
| `.env.example`, `README.md` | Clerk の記述を削除する |
| `package.json` | `@clerk/nextjs`、`@clerk/testing`、`svix` を削除する |
| `scripts/seed-data.ts`, `seed-apply.ts` | シードのユーザーを `username = seed_user_N` で作り、`lower(username) LIKE 'seed\_%'` で見分ける（`_` は LIKE のワイルドカードなのでエスケープする）。`password_hash` は `'!'`（ログイン不可） |

## 6. テスト

### 単体テスト（Vitest＋PGlite）

| ファイル | 内容 |
| --- | --- |
| `password.test.ts`（新規） | ハッシュと照合、違うパスワードでの失敗、保存形式の解析 |
| `auth.test.ts`（新規） | 登録（ユーザー名の規則、大文字・小文字違いの重複、一意インデックス違反がユーザー名重複のエラーになる、`seed_` と `SEED_` の予約）、ログイン（成功、失敗、10回失敗で拒否、成功で記録が消える）、セッション（期限切れ、退会済み、期限延長） |
| `profile.test.ts`（新規） | 推しの保存（別の島のメンバー、`kind = 'topic'` のタグは拒否）、推しグループを外すとメンバーも消える、全置き換え |
| `auth-dialog.test.tsx`（新規） | タブの切り替え、エラー表示、登録後に2ステップ目へ進む |
| `like-button.test.tsx`, `composer.test.tsx` | 未ログイン時に `/sign-in` へ移動する代わりにモーダルが開くことを確認する |
| `island-admin.test.ts` | メンバーから外したタグが、推しメンバーからも外れることを追加で確認する |
| `env.test.ts`, `db.test.ts`, `seed.test.ts`, `tests/helpers/fixtures.ts` | Clerk の列と変数をなくした形に直す |
| `users.test.ts` | Clerk 部分を削除し、入力検証のテストは `validation.test.ts` へ移す |
| `auth-sync.test.ts`, `webhook-route.test.ts` | 削除 |

### E2E（Playwright、`tests/e2e/auth.spec.ts` を書き換え）

Clerk のテスト用キーが要らなくなるので、CI で常に実行する。ユーザー名は実行ごとに変える（`e2e_<時刻の36進数>`）。

1. 未ログインでいいねを押す → モーダルが開く。
2. 新規登録 → 推しの選択で島とメンバーを選んで保存 → ツールバーのメニューからプロフィールを開き、推しが表示されている。
3. 投稿 → いいね → 取り消し → 削除（既存のテストを引き継ぐ）。
4. ログアウト → ログイン → ツールバーにアカウントのボタンが出る。

## 7. タスク（1タスク＝1PRを目安）

| # | タスク | 完了条件 |
| --- | --- | --- |
| A-1 | スキーマとマイグレーション（`users` の列の入れ替え、`sessions`、`login_attempts`）、パスワードとセッションの処理、`lib/auth.ts` の置き換え、登録・ログイン・ログアウトの Server Actions、シードの修正 | 単体テストが通る。シードが新しい形式で入る |
| A-2 | 認証モーダル、ツールバーの `AccountButton`、`Composer` と `LikeButton` の誘導。Clerk の撤去（5章） | 画面から登録・ログイン・ログアウトができる。`@clerk` への参照が残っていない |
| A-3 | 推しのテーブルとマイグレーション、`updateProfileAction`、`ProfileEditor`、登録後の2ステップ目、島エディタでメンバーから外したときの推しの削除 | 登録直後に推しを保存できる |
| A-4 | `/u/[username]` のページ、本人の編集、投稿カードの作者リンク | 他人のプロフィールを開け、自分のプロフィールは編集できる |
| A-5 | E2E の書き換え、CI の確認、`README.md` の更新 | CI で E2E が通る |

A-1 と A-2 の間は、画面がまだ Clerk を参照しているので、A-1 と A-2 は同じブランチで続けて作業し、まとめてマージする。

## 8. リスクと対策

| リスク | 対策 |
| --- | --- |
| パスワードを忘れると復旧できない | 復旧手段は作らないと決めた。登録画面に明記し、利用者が承知したうえで登録できるようにする |
| ユーザー名の総当たり | 15分10回の試行制限。IP 単位の制限は、規模（10ユーザー）に対して不要と判断し入れない |
| 新規登録の大量実行 | 今回は対策しない。問題になったら IP 単位の制限を追加する |
| セッションの盗用 | Cookie は httpOnly と（本番では）Secure。DB にはトークンのハッシュだけを置く |
| CSRF | Server Actions は Next.js が Origin を検証する。Cookie も `SameSite=Lax` |
