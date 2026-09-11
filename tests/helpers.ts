import { SQL } from "bun";
import { withInsertLog } from "../src/infrastructure/database.ts";

export function testDb(): SQL {
  return withInsertLog(new SQL(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/otto"));
}
export async function migrate(db: SQL): Promise<void> {
  await db.unsafe(await Bun.file("migrations/001_initial.sql").text());
}

export async function reset(db: SQL): Promise<void> {
  await db`TRUNCATE bookings, payment_attempts, payment_events, outbox_jobs, outbox_events, students, trial_classes, parents CASCADE`;
}

export async function fixture(db: SQL, tag: string) {
  const parentId = `p_${tag}`;
  const studentId = `s_${tag}`;
  const classId = `c_${tag}`;
  await db`INSERT INTO parents (id, name) VALUES (${parentId}, ${tag}) ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO students (id, parent_id, name) VALUES (${studentId}, ${parentId}, ${tag}) ON CONFLICT (id) DO NOTHING`;
  const week = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  await db`INSERT INTO trial_classes (id, title, starts_at) VALUES (${classId}, ${tag}, ${week}::timestamptz) ON CONFLICT (id) DO NOTHING`;
  return { parentId, studentId, classId };
}
