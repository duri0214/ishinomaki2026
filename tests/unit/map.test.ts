import { describe, expect, it } from "vitest";
import {
  assetKey,
  BASE_NAMES,
  backgroundImage,
  baseAsset,
  baseSlots,
  hasLevelImages,
  idolImage,
  levelImage,
  toIsland,
} from "@/features/map/assets";
import {
  buildGrowth,
  buildHouses,
  buildMembers,
  cameraFor,
  clampToPlaza,
  defaultMemberPosition,
  fillTopTags,
  focusForPath,
  focusKey,
  growthCounts,
  HOUSE_SIZE,
  houseScale,
  hubOf,
  ISLAND_RADIUS,
  islandLevel,
  LEVEL_THRESHOLDS,
  MAP_TOPIC_HOUSES,
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

describe("家の区画（slots.json）", () => {
  it("どの土台にも、家10軒＋検索用1軒ぶんの区画があり、島の内側で重ならない", () => {
    expect(BASE_NAMES.length).toBeGreaterThanOrEqual(4);
    for (const name of BASE_NAMES) {
      const lots = baseSlots(name).lots.map(toIsland);
      expect(lots.length).toBeGreaterThanOrEqual(MAP_TOPIC_HOUSES + 1);
      for (let i = 0; i < lots.length; i++) {
        const a = must(lots[i]);
        expect(Math.abs(a.x)).toBeLessThan(ISLAND_RADIUS);
        expect(Math.abs(a.y)).toBeLessThan(ISLAND_RADIUS);
        for (let j = i + 1; j < lots.length; j++) {
          const b = must(lots[j]);
          // 斜め上から見ているので、縦の距離は地面では長くなる（slots.json と同じ 1.6 倍）
          expect(Math.hypot(a.x - b.x, (a.y - b.y) * 1.6)).toBeGreaterThan(20);
        }
      }
    }
  });
});

describe("buildHouses", () => {
  it("ふだんは上位10件の家が、街の中心に近い区画から順位順に入る（メンバーの家は出さない）", () => {
    const a = island("a", 0, 0);
    const lots = baseSlots(a.base).lots.map(toIsland);
    const houses = buildHouses(a);
    expect(houses).toHaveLength(MAP_TOPIC_HOUSES);
    houses.forEach((h, i) => {
      expect(h.kind).toBe("topic");
      expect(h.rank).toBe(i + 1);
      expect(h).toMatchObject(must(lots[i]));
    });
  });

  it("タグを検索中は、10か所の家が検索結果に入れ替わる（メンバーは家にせず、広場のアイコンを光らせる）", () => {
    const a = island("a", 0, 0);
    const lots = baseSlots(a.base).lots.map(toIsland);
    const houses = buildHouses(a, undefined, [
      { name: "Tag15", normalizedName: "tag15", kind: "topic" },
      { name: "member1", normalizedName: "member1", kind: "member" },
      { name: "新しい", normalizedName: "新しい", kind: "topic" },
    ]);
    expect(houses.map((h) => h.normalizedName)).toEqual(["tag15", "新しい"]);
    expect(houses[0]).toMatchObject({
      postCount: 85,
      rank: null,
      ...must(lots[0]),
    });
    expect(houses[1]).toMatchObject({ postCount: null, ...must(lots[1]) });
    // 空の検索結果ならふだんの10軒
    expect(buildHouses(a, undefined, [])).toHaveLength(MAP_TOPIC_HOUSES);
  });

  it("検索したタグに家がなければ、次の空き区画に1軒だけ建てる（上位20件にあれば名前と件数を使う）", () => {
    const a = island("a", 0, 0);
    const lots = baseSlots(a.base).lots.map(toIsland);
    const houses = buildHouses(a, "tag15");
    expect(houses).toHaveLength(MAP_TOPIC_HOUSES + 1);
    expect(houses.at(-1)).toMatchObject({
      normalizedName: "tag15",
      name: "Tag15",
      postCount: 85,
      rank: null,
      ...must(lots[MAP_TOPIC_HOUSES]),
    });
    // すでに家があるタグなら増えない
    expect(buildHouses(a, "tag3")).toHaveLength(MAP_TOPIC_HOUSES);
    // メンバーは広場のアイコンがあるので、家を建てない
    expect(buildHouses(a, "member2")).toHaveLength(MAP_TOPIC_HOUSES);
  });

  it("上位が10件に満たないときは、新しいタグで埋めて家を10軒にする", () => {
    const t = (id: string) => ({ id });
    expect(fillTopTags([t("a"), t("b")], [t("b"), t("c"), t("d")])).toEqual([
      t("a"),
      t("b"),
      t("c"),
      t("d"),
    ]);
    const ten = Array.from({ length: 10 }, (_, i) => t(`r${i}`));
    expect(fillTopTags(ten, [t("x")])).toEqual(ten);
  });

  it("10件に満たないときは、ある分だけ家を建てる", () => {
    const houses = buildHouses(island("a", 0, 0, 3));
    expect(houses.filter((h) => h.kind === "topic")).toHaveLength(3);
  });

  it("広場の外に置かれた位置は広場の縁に収める", () => {
    const p = clampToPlaza({ x: 300, y: 0 });
    expect(p.x).toBeCloseTo(PLAZA_RADIUS, 0);
    expect(clampToPlaza({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });
});

describe("buildMembers（中央の広場のメンバーのアイコン）", () => {
  it("全員のアイコンが広場の中にあり、重ならず、家の区画とも離れている", () => {
    for (const base of BASE_NAMES) {
      for (const count of [1, 2, 5, 7, 9, 12]) {
        const a = { ...island("a", 0, 0, 20, count), base };
        const hub = hubOf(a);
        const members = buildMembers(a);
        expect(members).toHaveLength(count);
        for (const [i, m] of members.entries()) {
          expect(m.size).toBeGreaterThan(0);
          // 広場の楕円の中（アイコンの半分くらいのはみ出しは許す）
          const d = Math.hypot((m.x - hub.x) / hub.rx, (m.y - hub.y) / hub.ry);
          expect(d).toBeLessThanOrEqual(1.0001);
          for (const other of members.slice(i + 1)) {
            expect(Math.hypot(m.x - other.x, m.y - other.y)).toBeGreaterThan(
              m.size * 0.95,
            );
          }
        }
        // 家の区画は広場の外
        for (const lot of baseSlots(base).lots.map(toIsland)) {
          const d = Math.hypot(
            (lot.x - hub.x) / hub.rx,
            (lot.y - hub.y) / hub.ry,
          );
          expect(d).toBeGreaterThan(1);
        }
      }
    }
  });

  it("登録順に12時の位置から時計回り。人数が多いときは1人目を真ん中に置く", () => {
    const five = buildMembers(island("a", 0, 0, 20, 5));
    const hub5 = hubOf(island("a", 0, 0, 20, 5));
    expect(must(five[0]).x).toBeCloseTo(hub5.x, 0);
    expect(must(five[0]).y).toBeLessThan(hub5.y);
    expect(must(five[1]).x).toBeGreaterThan(hub5.x);
    const nine = buildMembers(island("a", 0, 0, 20, 9));
    expect(must(nine[0])).toMatchObject({ x: hub5.x, y: hub5.y });
  });

  it("メンバーの絵: DB の画像 → public/map/idols/ の絵 → なし（頭文字のアイコン）", () => {
    const a = island("a", 0, 0, 20, 2);
    a.members[0] = { ...must(a.members[0]), imageUrl: "/x.webp" };
    const [m0, m1] = buildMembers(a);
    expect(m0?.imageUrl).toBe("/x.webp");
    expect(m1?.imageUrl).toBe(idolImage(a, "member1"));
    expect(idolImage({ name: "まだない島" }, "だれか")).toBeNull();
  });

  it("素材のキーは全角・半角、大文字・小文字、記号の違いを無視する", () => {
    expect(assetKey("M!LK")).toBe("mlk");
    expect(assetKey("M!lk")).toBe("mlk");
    expect(assetKey("FRUITS ZIPPER")).toBe("fruitszipper");
    expect(assetKey("ＴＷＩＣＥ")).toBe("twice");
    expect(assetKey("櫻井翔")).toBe("櫻井翔");
  });

  it("メンバーのタグを開くと、そのアイコンへ寄る", () => {
    const islands = [island("a", -430, -30)];
    expect(resolveFocus(islands, { island: "a", tag: "member3" })).toEqual({
      kind: "house",
      slug: "a",
      normalizedName: "member3",
    });
    const m = must(buildMembers(must(islands[0])).at(3));
    const cam = cameraFor(
      { kind: "house", slug: "a", normalizedName: "member3" },
      islands,
      VIEW,
    );
    const c = toScreen(cam, -430 + m.x, -30 + m.y);
    expect(c.x).toBeCloseTo(VIEW.width / 2, 0);
    expect(c.y).toBeCloseTo(VIEW.height / 2, 0);
  });

  it("背景の絵がまだなければ null", () => {
    for (const mode of ["kawaii", "cool"] as const) {
      const bg = backgroundImage(mode);
      if (bg !== null) expect(bg).toMatch(/^\/map\/background\//);
    }
  });

  it("家の倍率は 0.5〜1.3", () => {
    for (const base of BASE_NAMES) {
      const s = houseScale({ ...island("a", 0, 0), base });
      expect(s).toBeGreaterThanOrEqual(0.5);
      expect(s).toBeLessThanOrEqual(1.3);
    }
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
  it("家のあるタグ（上位10件）・メンバーなら家。URLエンコードされていても、大文字でも同じ", () => {
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
  it("上位10件以外のタグ（検索で開いたタグ）でも、空き区画に家を建ててその家へ寄る", () => {
    expect(resolveFocus(islands, { island: "a", tag: "tag15" })).toEqual({
      kind: "house",
      slug: "a",
      normalizedName: "tag15",
    });
    expect(resolveFocus(islands, { island: "a", tag: "unranked" })).toEqual({
      kind: "house",
      slug: "a",
      normalizedName: "unranked",
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

  it("島: 島全体が収まるときより大きく拡大し、家の区画がすべて画面に入る", () => {
    const worldK = Math.min(VIEW.width, VIEW.height) / (ISLAND_RADIUS * 2);
    const cam = cameraFor({ kind: "island", slug: "b" }, islands, VIEW);
    expect(cam.k).toBeGreaterThan(worldK * 1.4);
    const b = must(islands[1]);
    for (const h of buildHouses(b)) {
      const p = toScreen(cam, b.worldX + h.x, b.worldY + h.y);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(VIEW.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(VIEW.height);
    }
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
    // 家の絵が画面の中央に来るよう、接地点より少し上を中央にする
    const c = toScreen(cam, -430 + house.x, -30 + house.y - HOUSE_SIZE * 0.5);
    expect(c.x).toBeCloseTo(VIEW.width / 2, 0);
    expect(c.y).toBeCloseTo(VIEW.height / 2, 0);
    expect(cam.k).toBeGreaterThanOrEqual(islandCam.k * 1.6 - 1e-9);
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

describe("島のレベル（島民数）", () => {
  it("0人でレベル1、10人で2、100人で3、1000人で4、10000人で5", () => {
    expect(LEVEL_THRESHOLDS).toEqual([0, 10, 100, 1000, 10000]);
    expect(islandLevel(0)).toBe(1);
    expect(islandLevel(9)).toBe(1);
    expect(islandLevel(10)).toBe(2);
    expect(islandLevel(99)).toBe(2);
    expect(islandLevel(100)).toBe(3);
    expect(islandLevel(999)).toBe(3);
    expect(islandLevel(1000)).toBe(4);
    expect(islandLevel(9999)).toBe(4);
    expect(islandLevel(10000)).toBe(5);
    expect(islandLevel(999999)).toBe(5);
  });

  it("ないレベルの絵は null（絵がない土台は、代わりにペンライトや城を置く）", () => {
    expect(levelImage("base-01", "kawaii", 99)).toBeNull();
    expect(levelImage("no-such-base", "cool", 99)).toBeNull();
  });

  it("どの土台も lv2〜lv5 の絵が両方のモードにある（lv1 は土台そのもの）", () => {
    for (const base of BASE_NAMES) {
      for (const mode of ["cool", "kawaii"] as const) {
        expect(hasLevelImages(base, mode)).toBe(true);
        expect(levelImage(base, mode, 1)).toBeNull();
        for (const level of [2, 3, 4, 5]) {
          expect(levelImage(base, mode, level)).toMatch(
            new RegExp(`^/map/levels/${base}/(${mode}/)?lv${level}\\.webp$`),
          );
        }
      }
    }
  });
});

describe("モードごとの島の絵（かわいい / かっこいい）", () => {
  it("モード専用の土台があれば、絵も家の位置もカメラも切り替わる", () => {
    const b = must(
      BASE_NAMES.find((n) => baseAsset(n, "cool").src !== baseAsset(n).src),
    );
    expect(baseAsset(b, "kawaii").src).toBe(baseAsset(b).src);
    expect(baseSlots(b, "cool").lots).not.toEqual(baseSlots(b).lots);
    const isl = { ...island("m", 0, 0), base: b };
    const at = (mode: "cool" | "kawaii") =>
      buildHouses(isl, undefined, undefined, mode).map((h) => [h.x, h.y]);
    expect(at("cool")).not.toEqual(at("kawaii"));
    const cam = (mode: "cool" | "kawaii") =>
      cameraFor({ kind: "island", slug: "m" }, [isl], VIEW, mode);
    expect(cam("cool")).not.toEqual(cam("kawaii"));
  });

  it("モード専用の土台がない島は、どちらのモードでも同じ絵と配置", () => {
    for (const n of BASE_NAMES) {
      if (baseAsset(n, "cool").src !== baseAsset(n, "kawaii").src) continue;
      expect(baseSlots(n, "cool")).toBe(baseSlots(n, "kawaii"));
    }
  });
});

describe("島の成長（島民数）", () => {
  it("1の位＝ペンライト、10の位＝桜、100の位＝ステージ、1000人から城", () => {
    expect(growthCounts(0)).toEqual({
      penlight: 0,
      tree: 0,
      stage: 0,
      castle: false,
    });
    expect(growthCounts(7)).toEqual({
      penlight: 7,
      tree: 0,
      stage: 0,
      castle: false,
    });
    expect(growthCounts(37)).toEqual({
      penlight: 7,
      tree: 3,
      stage: 0,
      castle: false,
    });
    expect(growthCounts(120)).toEqual({
      penlight: 0,
      tree: 2,
      stage: 1,
      castle: false,
    });
    expect(growthCounts(999)).toEqual({
      penlight: 9,
      tree: 9,
      stage: 9,
      castle: false,
    });
    expect(growthCounts(1234)).toEqual({
      penlight: 4,
      tree: 3,
      stage: 2,
      castle: true,
    });
    expect(growthCounts(-5)).toEqual({
      penlight: 0,
      tree: 0,
      stage: 0,
      castle: false,
    });
  });

  it("数のとおりに置く。置き場所が足りない土台では、ある分だけ置く", () => {
    const roles = (base: string, n: number) => {
      const items = buildGrowth({ ...island("a", 0, 0), base }, n);
      const count = (role: string) =>
        items.filter((g) => g.role === role).length;
      return {
        penlight: count("penlight"),
        tree: count("tree"),
        stage: count("stage"),
        castle: count("castle"),
      };
    };
    expect(roles("base-05", 1234)).toEqual({
      penlight: 4,
      tree: 3,
      stage: 2,
      castle: 1,
    });
    expect(roles("base-05", 0)).toEqual({
      penlight: 0,
      tree: 0,
      stage: 0,
      castle: 0,
    });
    const small = roles("base-01", 999);
    expect(small.stage).toBe(Math.min(9, baseSlots("base-01").stage.length));
  });

  it("成長オブジェクトは島の内側に置かれる", () => {
    for (const base of BASE_NAMES) {
      for (const g of buildGrowth({ ...island("a", 0, 0), base }, 1999)) {
        expect(Math.abs(g.x)).toBeLessThan(ISLAND_RADIUS);
        expect(Math.abs(g.y)).toBeLessThan(ISLAND_RADIUS);
      }
    }
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
