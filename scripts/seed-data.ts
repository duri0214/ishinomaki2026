import type {
  islands,
  likes,
  posts,
  postTags,
  tags,
  users,
} from "../src/db/schema";
import { normalizeTagName } from "../src/features/tags/normalize";
import { parseHashtags } from "../src/features/tags/parse";

/**
 * シード用のダミーデータを作る（DBには触れない）。
 * 乱数は固定シードなので、同じ `now` なら毎回まったく同じデータになる。
 * 登場するグループ・人物はすべて架空のもの。
 */

export const SEED_USER_PREFIX = "seed_user_";
export const SEED_ISLAND_SLUGS = ["hoshizora", "shiokaze"] as const;

export type SeedData = {
  islands: (typeof islands.$inferInsert)[];
  users: (typeof users.$inferInsert)[];
  tags: (typeof tags.$inferInsert)[];
  posts: (typeof posts.$inferInsert)[];
  postTags: (typeof postTags.$inferInsert)[];
  likes: (typeof likes.$inferInsert)[];
};

const ISLANDS = [
  {
    slug: SEED_ISLAND_SLUGS[0],
    name: "星空シアター島",
    description: "架空のアイドルグループ「星空シアター」のファンの島",
    worldX: -430,
    worldY: -30,
    members: ["みさき", "ひなた", "かのん", "りお", "つぐみ"],
  },
  {
    slug: SEED_ISLAND_SLUGS[1],
    name: "潮風ガールズ島",
    description: "架空のアイドルグループ「潮風ガールズ」のファンの島",
    worldX: 430,
    worldY: 40,
    members: ["あおい", "ことは", "まりん", "なぎさ", "ゆず"],
  },
] as const;

/** 話題タグ（島ごとに別レコードになる。2つの島で同じ名前を使って独立性を確認できるようにする） */
const TOPIC_TAGS = [
  "自己紹介",
  "ライブ",
  "ライブレポ",
  "新曲",
  "物販",
  "握手会",
  "配信",
  "雑談",
  "初参戦",
  "推し活",
  "遠征",
  "聖地巡礼",
  "おすすめ",
  "質問",
  "今日のコーデ",
  "ライブ飯",
  "写真",
  "歌ってみた",
  "振り付け",
  "セトリ",
  "差し入れ",
  "初心者",
  "イベント",
  "告知",
  "感謝",
  "応援",
  "思い出",
  "MV",
] as const;

const USER_NAMES = [
  "さくら",
  "はると",
  "ゆうき",
  "みなと",
  "あかり",
  "そうた",
  "ひまり",
  "れん",
  "ことね",
  "かいと",
] as const;

const SENTENCES = [
  "今日もいい一日でした",
  "さっき聴いたら泣きそうになった",
  "初めて投稿します、よろしくお願いします",
  "みんなはどうだった？",
  "次の機会が待ちきれない",
  "思い出しただけで元気が出る",
  "友達に布教してきた",
  "帰りの電車でずっと聴いてる",
  "寝不足だけど最高だった",
  "また行きたいなあ",
  "おすすめがあったら教えてください",
  "今週もがんばれそう",
  "写真を整理していたら見つけた",
  "感想を書き残しておく",
  "ちょっと遠かったけど行ってよかった",
] as const;

const DAY_MS = 24 * 3600 * 1000;

/** 固定シードの乱数 (mulberry32) */
function createRandom(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(list: readonly T[]): T => list[int(list.length)] as T;
  const uuid = () => {
    const b = Array.from({ length: 16 }, () => int(256));
    b[6] = ((b[6] as number) & 0x0f) | 0x40;
    b[8] = ((b[8] as number) & 0x3f) | 0x80;
    const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
  return { next, int, pick, uuid };
}

export const SEED_POSTS_PER_ISLAND = 250;

export function generateSeed(now: Date): SeedData {
  const rnd = createRandom(20261011);
  const data: SeedData = {
    islands: [],
    users: [],
    tags: [],
    posts: [],
    postTags: [],
    likes: [],
  };
  const createdBase = new Date(now.getTime() - 15 * DAY_MS);

  for (let i = 0; i < USER_NAMES.length; i++) {
    data.users.push({
      id: rnd.uuid(),
      clerkUserId: `${SEED_USER_PREFIX}${i + 1}`,
      displayName: USER_NAMES[i] as string,
      createdAt: createdBase,
      updatedAt: createdBase,
    });
  }

  for (const spec of ISLANDS) {
    const islandId = rnd.uuid();
    data.islands.push({
      id: islandId,
      slug: spec.slug,
      name: spec.name,
      description: spec.description,
      worldX: spec.worldX,
      worldY: spec.worldY,
      createdAt: createdBase,
    });

    // 島内のタグ: normalizedName -> 行
    const tagRows = new Map<string, typeof tags.$inferInsert>();
    const addTag = (name: string, kind: "member" | "topic") => {
      const normalizedName = normalizeTagName(name);
      const row = {
        id: rnd.uuid(),
        islandId,
        name,
        normalizedName,
        kind,
        createdAt: createdBase,
      };
      tagRows.set(normalizedName, row);
      return row;
    };
    const members = spec.members.map((m) => addTag(m, "member"));
    // 島ごとに少し順番を変えて、上位の顔ぶれが島ごとに違うようにする
    const topicNames = [...TOPIC_TAGS];
    const shift = rnd.int(topicNames.length);
    const topics = topicNames
      .map((_, k) => topicNames[(k + shift) % topicNames.length] as string)
      .map((n) => addTag(n, "topic"));
    // 上位に偏らせる重み (Zipf)
    const weights = topics.map((_, k) => 1 / (k + 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const pickTopic = () => {
      let r = rnd.next() * totalWeight;
      for (let k = 0; k < topics.length; k++) {
        r -= weights[k] as number;
        if (r <= 0) return topics[k] as (typeof topics)[number];
      }
      return topics[0] as (typeof topics)[number];
    };

    const islandPostIds: string[] = [];
    for (let n = 0; n < SEED_POSTS_PER_ISLAND; n++) {
      const author = data.users[rnd.int(data.users.length)] as {
        id?: string;
      };
      // 新しい投稿ほど多くなるように偏らせる
      const age = Math.floor(rnd.next() ** 1.6 * 14 * DAY_MS) + rnd.int(1000);
      const createdAt = new Date(now.getTime() - age);

      const r = rnd.next();
      const tagCount = r < 0.15 ? 0 : r < 0.6 ? 1 : r < 0.9 ? 2 : 3;
      const names: string[] = [];
      for (let k = 0; k < tagCount; k++) names.push(pickTopic().name);
      if (rnd.next() < 0.35)
        names.push((rnd.pick(members) as { name: string }).name);

      const sentence = rnd.pick(SENTENCES);
      const hashtags = [...new Set(names)].map((t) => `#${t}`);
      // 文中・文末のどちらにもタグが現れるようにする
      const body =
        hashtags.length > 0 && rnd.next() < 0.3
          ? `${hashtags[0]} ${sentence} ${hashtags.slice(1).join(" ")}`.trim()
          : `${sentence} ${hashtags.join(" ")}`.trim();

      const postId = rnd.uuid();
      islandPostIds.push(postId);
      data.posts.push({
        id: postId,
        islandId,
        authorId: author.id as string,
        body,
        createdAt,
      });
      // 本番と同じ解析関数でタグを決める
      for (const t of parseHashtags(body).tags) {
        let row = tagRows.get(t.normalizedName);
        if (!row) row = addTag(t.name, "topic");
        data.postTags.push({ postId, tagId: row.id as string });
      }
    }

    data.tags.push(...tagRows.values());

    for (const postId of islandPostIds) {
      for (const user of data.users) {
        if (rnd.next() < 0.08) {
          data.likes.push({
            userId: user.id as string,
            postId,
            createdAt: now,
          });
        }
      }
    }
  }
  return data;
}
