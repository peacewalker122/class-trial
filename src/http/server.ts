import { database } from "../infrastructure/database.ts";
import { startWorker } from "../infrastructure/hold-sweeper.ts";
import { routeRequest } from "./routes.ts";

export function serve(port = Number(process.env.PORT ?? 3000)) {
  const db = database();
  const stopWorker = startWorker(db);
  const server = Bun.serve({ port, fetch: (req) => routeRequest(db, req) });
  return { server, stop: () => stopWorker() };
}
