import { neon, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * このファイルは Next.js 以外（scripts/ やテスト）からも読み込むので、
 * `server-only` を import してはいけない。アプリ側は src/db/index.ts を使う。
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type Connection = {
  kind: "neon" | "pglite";
  /** 読み取りと単一文の書き込み用。Neon では HTTP ドライバ（接続が速い） */
  db: Db;
  /** `transaction()` を使う処理用。Neon では WebSocket ドライバ（HTTP は非対応） */
  txDb: Db;
  /** drizzle/ のマイグレーションを適用する */
  migrate: (migrationsFolder: string) => Promise<void>;
  close: () => Promise<void>;
};

export type ConnectOptions = {
  /** 指定すると Neon に接続する。省略するとローカルの PGlite を使う */
  databaseUrl?: string;
  /** PGlite のデータ置き場。省略するとメモリ上 */
  pgliteDir?: string;
};

export async function connect(options: ConnectOptions): Promise<Connection> {
  if (options.databaseUrl) {
    const pool = new Pool({ connectionString: options.databaseUrl });
    const db = drizzleHttp({ client: neon(options.databaseUrl), schema });
    const txDb = drizzleWs({ client: pool, schema });
    return {
      kind: "neon",
      db,
      txDb,
      migrate: async (folder) => {
        const { migrate } = await import(
          "drizzle-orm/neon-serverless/migrator"
        );
        await migrate(txDb as unknown as Parameters<typeof migrate>[0], {
          migrationsFolder: folder,
        });
      },
      close: () => pool.end(),
    };
  }

  // PGlite は devDependency なので、Neon を使う本番では読み込まない
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = options.pgliteDir
    ? new PGlite(options.pgliteDir)
    : new PGlite();
  await client.waitReady;
  const db = drizzle({ client, schema }) as unknown as Db;
  return {
    kind: "pglite",
    db,
    txDb: db,
    migrate: async (folder) => {
      const { migrate } = await import("drizzle-orm/pglite/migrator");
      await migrate(drizzle({ client, schema }), { migrationsFolder: folder });
    },
    close: () => client.close(),
  };
}
