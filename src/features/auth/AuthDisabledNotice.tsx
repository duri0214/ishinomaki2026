import Link from "next/link";

/** Clerk のキーが未設定のときに、サインイン画面の代わりに出す案内 */
export function AuthDisabledNotice() {
  return (
    <div className="max-w-md rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">ログインは現在設定されていません</p>
      <p className="mt-1">
        Clerk のキー（NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY /
        CLERK_SECRET_KEY）が未設定のため、
        投稿といいねはできません。閲覧はそのまま利用できます。
      </p>
      <Link href="/" className="mt-3 inline-block underline">
        トップへ戻る
      </Link>
    </div>
  );
}
