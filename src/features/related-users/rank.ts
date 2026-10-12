import { RELATED_BADGE_LIMIT, RELATED_USERS_MAX } from "./constants";

/** 共通点の種類。この並びがそのまま優先順位（推しメンバー > ライブ > 推しグループ） */
export const COMMON_KINDS = ["member", "live", "island"] as const;
export type CommonKind = (typeof COMMON_KINDS)[number];

/** 画面に出す共通点 1件分 */
export type CommonPoint = {
  kind: CommonKind;
  /** member: タグID / live: 公演ID / island: 島ID */
  id: string;
  /** member: メンバー名 / live: 公演名 / island: グループ名 */
  label: string;
  /** member・live は所属するグループ名。island は label と同じ */
  islandName: string;
};

/** DB から取り出した共通点 1件分（どのユーザーとの共通点か、を付けたもの） */
export type CommonRow = CommonPoint & {
  userId: string;
  username: string;
  displayName: string;
  /** 所属する島。推しグループの重複を除くのに使い、画面には渡さない */
  islandId: string;
};

export type RelatedUser = {
  id: string;
  username: string;
  displayName: string;
  /** 優先順位の高い順に、最大 RELATED_BADGE_LIMIT 件 */
  commons: CommonPoint[];
  /** commons に入りきらなかった共通点の数 */
  moreCount: number;
};

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const byLabel = (a: CommonPoint, b: CommonPoint) =>
  compareText(a.label, b.label) ||
  compareText(a.islandName, b.islandName) ||
  compareText(a.id, b.id);

type Group = {
  id: string;
  username: string;
  displayName: string;
  rows: Record<CommonKind, Map<string, CommonRow>>;
};

/**
 * 共通点の行から、共通点のあるユーザーを優先順位の順に並べる。DB には触れない。
 *
 * - 推しメンバーが共通している島の「推しグループ」は、メンバーの共通点に含まれるので数えない（別バッジにもしない）。
 * - 並び順: 最も優先順位の高い共通点の種類 → その種類の共通点の多さ → 共通点の合計 → ユーザーID。
 *   最後にユーザーIDで決めるので、同じ入力なら毎回同じ順序になる。
 * - 共通点が1つもないユーザーは返さない。
 */
export function rankRelatedUsers(
  rows: CommonRow[],
  limit: number = RELATED_USERS_MAX,
): RelatedUser[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    let group = groups.get(row.userId);
    if (!group) {
      group = {
        id: row.userId,
        username: row.username,
        displayName: row.displayName,
        rows: { member: new Map(), live: new Map(), island: new Map() },
      };
      groups.set(row.userId, group);
    }
    group.rows[row.kind].set(row.id, row);
  }

  const ranked = [...groups.values()].flatMap((group) => {
    const coveredIslands = new Set(
      [...group.rows.member.values()].map((r) => r.islandId),
    );
    const lists: Record<CommonKind, CommonRow[]> = {
      member: [...group.rows.member.values()],
      live: [...group.rows.live.values()],
      island: [...group.rows.island.values()].filter(
        (r) => !coveredIslands.has(r.islandId),
      ),
    };
    const tier = COMMON_KINDS.findIndex((kind) => lists[kind].length > 0);
    if (tier === -1) return [];
    const points = COMMON_KINDS.flatMap((kind) =>
      lists[kind]
        .map(
          ({ kind, id, label, islandName }): CommonPoint => ({
            kind,
            id,
            label,
            islandName,
          }),
        )
        .sort(byLabel),
    );
    const kind = COMMON_KINDS[tier] as CommonKind;
    return [
      {
        tier,
        tierCount: lists[kind].length,
        total: points.length,
        user: {
          id: group.id,
          username: group.username,
          displayName: group.displayName,
          commons: points.slice(0, RELATED_BADGE_LIMIT),
          moreCount: Math.max(0, points.length - RELATED_BADGE_LIMIT),
        },
      },
    ];
  });

  ranked.sort(
    (a, b) =>
      a.tier - b.tier ||
      b.tierCount - a.tierCount ||
      b.total - a.total ||
      compareText(a.user.id, b.user.id),
  );
  return ranked.slice(0, limit).map((r) => r.user);
}
