import { database } from "../src/infrastructure/database.ts";
import { seedDemo } from "../src/infrastructure/postgres-repositories.ts";

const migration = await Bun.file("migrations/001_initial.sql").text();
const db = database();
await db.unsafe(migration);
await seedDemo(db);
console.log("database ready");
await db.close();
