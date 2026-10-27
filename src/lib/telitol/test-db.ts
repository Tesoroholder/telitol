import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";

/** A fresh in-memory Postgres with every migration applied, wrapped as `Sql`. Tests only. */
export async function createTestSql(): Promise<{
  sql: Sql;
  close: () => Promise<void>;
}> {
  const pg = new PGlite({ parsers: { 20: Number } });
  const dir = join(import.meta.dirname, "..", "..", "..", "migrations");
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await pg.exec(readFileSync(join(dir, name), "utf8"));
  }
  const run = async <T>(text: string, params: unknown[]) =>
    (await pg.query<T>(text, params)).rows;
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
  return { sql, close: () => pg.close() };
}
