import "server-only";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __afdClient?: Client };
const url = process.env.DATABASE_URL ?? "file:./data/anaf-for-dummies.db";

// libSQL deschide fișierul imediat: directorul trebuie să existe (clonă nouă, build în Docker).
if (url.startsWith("file:")) mkdirSync(dirname(url.slice("file:".length)), { recursive: true });

const client = globalForDb.__afdClient ?? createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });

if (process.env.NODE_ENV !== "production") globalForDb.__afdClient = client;

export const db = drizzle({ client, schema });
export type DB = typeof db;
/** Tipul tranzacției Drizzle — util pentru helperi care pot rula în/înafara unei tranzacții. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;
export { schema };
