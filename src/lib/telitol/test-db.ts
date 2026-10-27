import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";

type Runner = <T>(text: string, params: unknown[]) => Promise<T[]>;

function toSql(run: Runner): Sql {
  const sql = (async <T>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1)
      text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T>(text: string, params: unknown[] = []) => run<T>(text, params);
  return sql;
}

/** A fresh in-memory Postgres with every migration applied, wrapped as `Sql`. Tests only. */
export async function createTestSql(): Promise<{
  sql: Sql;
  withTx: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}> {
  const pg = new PGlite({ parsers: { 20: Number } });
  const dir = join(import.meta.dirname, "..", "..", "..", "migrations");
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await pg.exec(readFileSync(join(dir, name), "utf8"));
  }
  const sql = toSql(
    async (text, params) => (await pg.query(text, params)).rows as never[],
  );
  const withTx = <T>(fn: (tx: Sql) => Promise<T>) =>
    pg.transaction((tx: Transaction) =>
      fn(
        toSql(
          async (text, params) =>
            (await tx.query(text, params)).rows as never[],
        ),
      ),
    );
  return { sql, withTx, close: () => pg.close() };
}
