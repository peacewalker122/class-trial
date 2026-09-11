import { SQL } from "bun";

let instance: SQL | null = null;

function queryText(args: unknown[]): string {
  const first = args[0] as readonly string[] | string | undefined;
  if (typeof first === "string") return first;
  if (Array.isArray(first)) return String(first[0]);
  return "";
}

function logInsert(args: unknown[]): void {
  if (!/^\s*insert\b/i.test(queryText(args))) return;
  const table = queryText(args).match(/insert\s+into\s+([\w."]+)/i)?.[1] ?? "unknown";
  console.log(`[db-insert] ${table}`, JSON.stringify(args.slice(1)));
}

export function withInsertLog(db: SQL): SQL {
  const handler: ProxyHandler<object> = {
    apply(target, thisArg, args) {
      logInsert(args);
      return Reflect.apply(target as never, thisArg, args);
    },
    get(target, prop) {
      const value = Reflect.get(target as object, prop) as unknown;
      if (typeof value !== "function") return value;
      if (prop === "begin") {
        return (cb: (tx: SQL) => Promise<unknown>) =>
          (value as (cb: (tx: SQL) => Promise<unknown>) => Promise<unknown>).call(
            target,
            (tx: SQL) => cb(new Proxy(tx, handler) as unknown as SQL),
          );
      }
      return (...args: unknown[]) => {
        logInsert(args);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  };
  return new Proxy(db, handler) as unknown as SQL;
}

export function database(): SQL {
  if (!instance) {
    instance = withInsertLog(
      new SQL(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/otto"),
    );
  }
  return instance;
}
