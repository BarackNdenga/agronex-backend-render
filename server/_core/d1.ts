/// <reference types="@cloudflare/workers-types" />
import { getRuntimeBinding } from "./runtime-bindings";

export type D1Value = string | number | boolean | ArrayBuffer | ArrayBufferView | null;
export type D1Command = { sql: string; values: D1Value[] };

export function getD1Database(): D1Database {
  const database = getRuntimeBinding<D1Database>("DB");
  if (!database) throw new Error("Le binding Cloudflare D1 `DB` n’est pas configuré.");
  return database;
}

export async function runD1Batch(commands: D1Command[]) {
  const database = getD1Database();
  const statements = commands.map(({ sql, values }) => database.prepare(sql).bind(...values));
  return database.batch(statements);
}

export async function runD1(command: D1Command) {
  const database = getD1Database();
  return database.prepare(command.sql).bind(...command.values).run();
}

export function isD1UniqueConstraintError(error: unknown) {
  const message = String(error);
  return message.includes("UNIQUE constraint failed") || message.includes("PRIMARY KEY constraint failed");
}
