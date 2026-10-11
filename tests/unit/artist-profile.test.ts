import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GET } from "@/app/api/artists/[island]/route";
import { getDb } from "@/db";
import type { Connection } from "@/db/connect";
import { islands } from "@/db/schema";
import { getArtistProfile } from "@/features/artists/queries";
import { createTestDb } from "../helpers/db";
import { insertIsland } from "../helpers/fixtures";

vi.mock("@/db", () => ({ getDb: vi.fn() }));

let conn: Connection;
const dbMock = vi.mocked(getDb);

beforeAll(async () => {
  conn = await createTestDb();
  await conn.db.insert(islands).values({
    slug: "artist-profile",
    name: "星空シアター",
    description:
      "星空をテーマに活動する架空のアイドルグループ。\n5人で歌を届けます。",
    worldX: 0,
    worldY: 0,
    theme: { internal: "公開しない情報" },
  });
});

afterAll(async () => {
  await conn.close();
});

beforeEach(() => {
  dbMock.mockReset().mockResolvedValue(conn.db);
});

const request = (island: string) =>
  GET(new Request("http://localhost/api/artists/test"), {
    params: Promise.resolve({ island }),
  });

describe("アーティストのプロフィール", () => {
  it("登録済みの名前・説明を、そのまま返す。別の島の情報は混ざらない", async () => {
    const other = await insertIsland(conn.db);
    expect(await getArtistProfile(conn.db, "artist-profile")).toEqual({
      name: "星空シアター",
      description:
        "星空をテーマに活動する架空のアイドルグループ。\n5人で歌を届けます。",
    });
    expect(await getArtistProfile(conn.db, other.slug)).toEqual({
      name: other.name,
      description: null,
    });
    expect(await getArtistProfile(conn.db, "no-such-artist")).toBeUndefined();
  });

  it("APIはログインなしで取得でき、名前と説明以外の列を公開しない", async () => {
    const response = await request("artist-profile");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      profile: {
        name: "星空シアター",
        description:
          "星空をテーマに活動する架空のアイドルグループ。\n5人で歌を届けます。",
      },
    });
  });

  it("不正なslugはDBに接続せず400を返す", async () => {
    expect((await request("invalid/slug")).status).toBe(400);
    expect(dbMock).not.toHaveBeenCalled();
  });

  it("存在しない島は404を返す", async () => {
    expect((await request("no-such-artist")).status).toBe(404);
  });

  it("DBの接続失敗は503を返し、接続文字列をレスポンスに含めない", async () => {
    dbMock.mockRejectedValue(
      new Error("postgresql://private-user:private-password@private-host/db"),
    );
    const response = await request("artist-profile");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "アーティスト情報を読み込めませんでした",
    });
  });
});
