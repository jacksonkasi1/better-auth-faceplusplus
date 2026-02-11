import { drizzle } from "drizzle-orm/neon-serverless";
import type { Env } from "./types";
import * as schema from "./schema";

export function createClient(env?: Env) {
  const databaseUrl = env?.DATABASE_URL ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return drizzle({
    connection: databaseUrl,
    schema,
  });
}

export type DbInstance = ReturnType<typeof createClient>;
