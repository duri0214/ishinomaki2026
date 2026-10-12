/** 取得する最大人数（優先順位の上位から）。サーバー側でも切り詰める */
export const RELATED_USERS_MAX = 50;

/** 最初に表示する人数と、「もっと見る」で増やす人数 */
export const RELATED_USERS_PAGE_SIZE = 10;

/** 1人のカードに並べる共通点のバッジの最大数。超えた分は「他N件」にまとめる */
export const RELATED_BADGE_LIMIT = 3;

/** 関連ユーザーの TanStack Query のキー（先頭）。ログイン・ログアウトで消す */
export const RELATED_USERS_KEY = "related-users";

/** 未ログインで「関連ユーザー」を開こうとしたときに、認証モーダルの上部へ出す一文 */
export const RELATED_USERS_SIGN_IN_REASON =
  "共通点のあるユーザーを見るにはアカウントが必要です";
