import { describe, expect, it } from "vitest";
import {
  buildHouses,
  cameraFor,
  clampToPlaza,
  defaultMemberPosition,
  focusForPath,
  focusKey,
  HOUSE_SIZE,
  HOUSE_SLOTS,
  ISLAND_RADIUS,
  PLAZA_RADIUS,
  resolveFocus,
} from "@/features/map/layout";
import { houseStyle, islandPath } from "@/features/map/shapes";
import type { MapIslandData } from "@/features/map/types";
import { must } from "../helpers/must";

function island(
  slug: string,
  worldX: number,
  worldY: number,
  topCount = 20,
  memberCount = 5,
): MapIslandData {
  return {
    id: `${slug}-id`,
    slug,
    name: slug,
    worldX,
    worldY,
    imageUrl: null,
    members: Array.from({ length: memberCount }, (_, i) => ({
      id: `${slug}-m${i}`,
      name: `member${i}`,
      normalizedName: `member${i}`,
      imageUrl: null,
      position: null,
    })),
    topTags: Array.from({ length: topCount }, (_, i) => ({
      id: `${slug}-t${i}`,
      name: `Tag${i}`,
      normalizedName: `tag${i}`,
      imageUrl: null,
      postCount: 100 - i,
    })),
  };
}

const VIEW = { width: 1000, height: 500 };
/** カメラ変換後の、世界座標の画面位置 */
const toScreen = (
  c: { x: number; y: number; k: number },
  x: number,
  y: number,
) => ({
  x: x * c.k + c.x,
  y: y * c.k + c.y,
});

describe("家のスロット", () => {
  it("20個あり、互いに重ならず、広場の外・島の内側に収まる", () => {
    expect(HOUSE_SLOTS).toHaveLength(20);
    const minGap = HOUSE_SIZE + 12;
    for (let i = 0; i < HOUSE_SLOTS.length; i++) {
      const a = must(HOUSE_SLOTS[i]);
      const r = Math.hypot(a.x, a.y);
      expect(r).toBeGreaterThan(PLAZA_RADIUS + HOUSE_SIZE / 2);
      // 家とラベルが、島の輪郭の最小半径(86%)に収まる
      expect(r + HOUSE_SIZE / 2 + 30).toBeLessThan(ISLAND_RADIUS * 0.86);
      for (let j = i + 1; j < HOUSE_SLOTS.length; j++) {
        const b = must(HOUSE_SLOTS[j]);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(minGap);
      }
    }
  });
});

describe("buildHouses", () => {
  it("順位 i はスロット i に置かれ、上位ほど内側のリング", () => {
    const houses = buildHouses(island("a", 0, 0));
    const topics = houses.filter((h) => h.kind === "topic");
    expect(topics).toHaveLength(20);
    topics.forEach((h, i) => {
      expect(h.rank).toBe(i + 1);
      expect(h).toMatchObject(must(HOUSE_SLOTS[i]));
    });
    const radius = (i: number) =>
      Math.hypot(must(topics[i]).x, must(topics[i]).y);
    expect(radius(0)).toBeLessThan(radius(19));
    expect(radius(7)).toBeLessThan(radius(8));
  });

  it("20件に満たないときは、空いたスロットに家を置かない", () => {
    const houses = buildHouses(island("a", 0, 0, 3));
    expect(houses.filter((h) => h.kind === "topic")).toHaveLength(3);
  });

  it("メンバーは広場に置き、集計(順位・件数)は付かない。保存した位置があればそれを使う", () => {
    const base = island("a", 0, 0, 0, 3);
    const withPos: MapIslandData = {
      ...base,
      members: base.members.map((m, i) =>
        i === 0 ? { ...m, position: { x: 10, y: -20 } } : m,
      ),
    };
    const members = buildHouses(withPos).filter((h) => h.kind === "member");
    expect(members).toHaveLength(3);
    expect(members[0]).toMatchObject({
      x: 10,
      y: -20,
      rank: null,
      postCount: null,
    });
    for (const m of members) {
      expect(Math.hypot(m.x, m.y)).toBeLessThanOrEqual(PLAZA_RADIUS);
    }
  });

  it("広場の外に置かれた位置は広場の縁に収める", () => {
    const p = clampToPlaza({ x: 300, y: 0 });
    expect(p.x).toBeCloseTo(PLAZA_RADIUS, 0);
    expect(clampToPlaza({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });
});

describe("defaultMemberPosition", () => {
  it("人数によらず重ならず、広場に収まる", () => {
    for (let count = 1; count <= 12; count++) {
      const ps = Array.from({ length: count }, (_, i) =>
        defaultMemberPosition(i, count),
      );
      for (const p of ps) {
        expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(PLAZA_RADIUS - 10);
      }
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const a = must(ps[i]);
          const b = must(ps[j]);
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(14);
        }
      }
    }
  });
  it("1人なら中央", () => {
    expect(defaultMemberPosition(0, 1)).toEqual({ x: 0, y: 0 });
  });
});

describe("resolveFocus / focusForPath", () => {
  const islands = [island("a", -430, 0), island("b", 430, 0)];
  it("島もタグもなければ世界", () => {
    expect(resolveFocus(islands, {})).toEqual({ kind: "world" });
    expect(resolveFocus(islands, { island: "nope" })).toEqual({
      kind: "world",
    });
  });
  it("島だけなら島", () => {
    expect(resolveFocus(islands, { island: "a" })).toEqual({
      kind: "island",
      slug: "a",
    });
  });
  it("上位20件のタグ・メンバーなら家。URLエンコードされていても、大文字でも同じ", () => {
    expect(resolveFocus(islands, { island: "a", tag: "tag3" })).toEqual({
      kind: "house",
      slug: "a",
      normalizedName: "tag3",
    });
    expect(resolveFocus(islands, { island: "a", tag: "TAG3" })).toMatchObject({
      kind: "house",
    });
    expect(
      resolveFocus(islands, { island: "a", tag: "member1" }),
    ).toMatchObject({
      kind: "house",
    });
    const jp = island("c", 0, 0);
    jp.topTags[0] = {
      ...must(jp.topTags[0]),
      name: "自己紹介",
      normalizedName: "自己紹介",
    };
    expect(
      resolveFocus([jp], { island: "c", tag: encodeURIComponent("自己紹介") }),
    ).toMatchObject({ kind: "house", normalizedName: "自己紹介" });
  });
  it("上位20件以外のタグでは島のまま（ズームしない）", () => {
    expect(resolveFocus(islands, { island: "a", tag: "unranked" })).toEqual({
      kind: "island",
      slug: "a",
    });
  });
  it("パスからフォーカスを求められる（クリック直後のズーム用）", () => {
    expect(focusForPath(islands, "/")).toEqual({ kind: "world" });
    expect(focusForPath(islands, "/i/b")).toEqual({
      kind: "island",
      slug: "b",
    });
    expect(focusForPath(islands, "/i/b/t/tag1")).toMatchObject({
      kind: "house",
    });
    expect(focusKey(focusForPath(islands, "/i/b/t/tag1"))).toBe("house:b:tag1");
  });
});

describe("cameraFor", () => {
  const islands = [island("a", -430, -30), island("b", 430, 40)];

  it("世界: 全ての島が画面に収まる", () => {
    const cam = cameraFor({ kind: "world" }, islands, VIEW);
    for (const i of islands) {
      for (const [dx, dy] of [
        [-ISLAND_RADIUS, 0],
        [ISLAND_RADIUS, 0],
        [0, -ISLAND_RADIUS],
        [0, ISLAND_RADIUS],
      ] as const) {
        const p = toScreen(cam, i.worldX + dx, i.worldY + dy);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(VIEW.width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(VIEW.height);
      }
    }
  });

  it("島: 島の中心が画面中央に来て、島全体が収まる", () => {
    const cam = cameraFor({ kind: "island", slug: "b" }, islands, VIEW);
    const c = toScreen(cam, 430, 40);
    expect(c.x).toBeCloseTo(VIEW.width / 2, 0);
    expect(c.y).toBeCloseTo(VIEW.height / 2, 0);
    expect(ISLAND_RADIUS * 2 * cam.k).toBeLessThanOrEqual(VIEW.height);
  });

  it("家: 家が画面中央に来て、島より大きく拡大される", () => {
    const islandCam = cameraFor({ kind: "island", slug: "a" }, islands, VIEW);
    const house = must(
      buildHouses(must(islands[0])).find((h) => h.normalizedName === "tag5"),
    );
    const cam = cameraFor(
      { kind: "house", slug: "a", normalizedName: "tag5" },
      islands,
      VIEW,
    );
    const c = toScreen(cam, -430 + house.x, -30 + house.y);
    expect(c.x).toBeCloseTo(VIEW.width / 2, 0);
    expect(c.y).toBeCloseTo(VIEW.height / 2, 0);
    expect(cam.k).toBeGreaterThan(islandCam.k * 3);
  });

  it("存在しない島・家、島が0件でも壊れない", () => {
    expect(
      cameraFor({ kind: "island", slug: "zzz" }, islands, VIEW).k,
    ).toBeGreaterThan(0);
    expect(
      cameraFor(
        { kind: "house", slug: "a", normalizedName: "zzz" },
        islands,
        VIEW,
      ).k,
    ).toBeGreaterThan(0);
    expect(cameraFor({ kind: "world" }, [], VIEW).k).toBe(1);
    expect(
      cameraFor({ kind: "world" }, islands, { width: 0, height: 0 }).k,
    ).toBeGreaterThan(0);
  });
});

describe("手続き生成の図形", () => {
  it("同じIDなら島の形も家の見た目も常に同じ", () => {
    expect(islandPath("abc")).toBe(islandPath("abc"));
    expect(houseStyle("tag-1")).toEqual(houseStyle("tag-1"));
  });
  it("IDが違えば島の形も家の見た目も変わる", () => {
    expect(islandPath("abc")).not.toBe(islandPath("abd"));
    const styles = new Set(
      Array.from({ length: 30 }, (_, i) => JSON.stringify(houseStyle(`t${i}`))),
    );
    expect(styles.size).toBeGreaterThan(25);
  });
  it("島の輪郭は閉じたパスで、半径は86%〜100%に収まる", () => {
    const d = islandPath("abc", 100);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    // 制御点は輪郭より少し外側に出ることがあるので、通過点(各Cの終点)だけを確認する
    const points = [...d.matchAll(/C[^C]*?(-?[\d.]+) (-?[\d.]+)(?=C|Z)/g)].map(
      (m) => [Number(m[1]), Number(m[2])],
    );
    expect(nums.length).toBeGreaterThan(40);
    expect(points.length).toBe(40);
    for (const [x, y] of points) {
      const r = Math.hypot(x ?? 0, y ?? 0);
      expect(r).toBeGreaterThanOrEqual(85.5);
      expect(r).toBeLessThanOrEqual(100.5);
    }
  });
});
