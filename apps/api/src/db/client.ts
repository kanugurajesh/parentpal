import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

export const sqlClient = postgres(env.databaseUrl, { max: 10, onnotice: () => {} });
export const db = drizzle(sqlClient, { schema });
export type DB = typeof db;
export { schema };
