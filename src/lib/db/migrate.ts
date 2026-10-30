import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync("data", { recursive: true });
  const client = createClient({
    url: process.env.DATABASE_URL ?? "file:./data/anaf-for-dummies.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  await client.execute("PRAGMA journal_mode = WAL;");
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  console.log("✓ Migrări aplicate");
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
