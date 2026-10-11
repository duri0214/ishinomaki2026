import { Webhook } from "svix";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Connection } from "@/db/connect";
import { findUserByClerkId } from "@/features/users/service";
import { createTestDb } from "../helpers/db";

let conn: Connection;
const SECRET = `whsec_${Buffer.from("test-signing-secret-0123456789").toString("base64")}`;

vi.mock("@/db", () => ({ getDb: async () => conn.db }));

beforeAll(async () => {
  conn = await createTestDb();
});

afterAll(async () => {
  await conn.close();
});

beforeEach(() => {
  vi.resetModules();
  delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
});

/** 本物の Clerk と同じ形式（svix）で署名したリクエストを作る */
function signedRequest(payload: object, secret = SECRET) {
  const body = JSON.stringify(payload);
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(id, timestamp, body);
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": signature,
    },
  });
}

async function callRoute(req: Request) {
  const { POST } = await import("@/app/api/webhooks/clerk/route");
  // NextRequest として扱えるよう、必要な部分だけ備えたリクエストを渡す
  return POST(req as unknown as Parameters<typeof POST>[0]);
}

const userEvent = (type: string, data: Record<string, unknown>) => ({
  type,
  data,
  object: "event",
});

describe("POST /api/webhooks/clerk", () => {
  it("シークレットが未設定なら 503", async () => {
    const res = await callRoute(
      signedRequest(userEvent("user.created", { id: "user_x" })),
    );
    expect(res.status).toBe(503);
  });

  it("署名が正しければ、ユーザーを作成・更新・削除に反映する", async () => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = SECRET;

    const created = await callRoute(
      signedRequest(
        userEvent("user.created", {
          id: "user_hook_1",
          username: "hook",
          image_url: "https://example.com/a.png",
        }),
      ),
    );
    expect(created.status).toBe(200);
    expect(await created.json()).toEqual({ result: "upserted" });
    expect(await findUserByClerkId(conn.db, "user_hook_1")).toBeDefined();

    const deleted = await callRoute(
      signedRequest(
        userEvent("user.deleted", { id: "user_hook_1", deleted: true }),
      ),
    );
    expect(await deleted.json()).toEqual({ result: "deleted" });
    expect(
      (await findUserByClerkId(conn.db, "user_hook_1"))?.deletedAt,
    ).toBeInstanceOf(Date);
  });

  it("署名が違えば 400 で、何も反映しない", async () => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = SECRET;
    const other = `whsec_${Buffer.from("another-secret-0123456789abcd").toString("base64")}`;
    const res = await callRoute(
      signedRequest(userEvent("user.created", { id: "user_forged" }), other),
    );
    expect(res.status).toBe(400);
    expect(await findUserByClerkId(conn.db, "user_forged")).toBeUndefined();
  });

  it("署名ヘッダーがなければ 400", async () => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = SECRET;
    const res = await callRoute(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        body: JSON.stringify(userEvent("user.created", { id: "user_nosig" })),
      }),
    );
    expect(res.status).toBe(400);
    expect(await findUserByClerkId(conn.db, "user_nosig")).toBeUndefined();
  });
});
