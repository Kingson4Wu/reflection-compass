// Fixed, server-selected partitions preserve the legacy owner's tables.
// This is not a generic SQL parser: private modules use bare table identifiers.
export const PRIVATE_TABLES = [
  "state",
  "subscription",
  "deliveries",
  "sync_guard",
  "sync_records",
  "sync_operations",
  "devices",
  "notification_target",
  "backups",
] as const;
export type PrivateDatabase = Pick<D1Database, "prepare" | "batch">;
export function partitionSQL(sql: string, seat: number) {
  if (!Number.isInteger(seat) || seat < 1 || seat > 5)
    throw new Error("Invalid account partition");
  const tokens =
    sql.match(
      /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9]*|\s+|./g,
    ) ?? [];
  let previous = "";
  return tokens
    .map((token, index) => {
      if (
        /^\s+$/.test(token) ||
        token.startsWith("--") ||
        token.startsWith("/*")
      )
        return token;
      const upper = token.toUpperCase();
      const next = tokens.slice(index + 1).find((t) => !/^\s+$/.test(t));
      const table = PRIVATE_TABLES.includes(
        token as (typeof PRIVATE_TABLES)[number],
      );
      const isTable = ["FROM", "JOIN", "INTO", "UPDATE", "TABLE"].includes(
        previous,
      );
      if (
        isTable &&
        /^[A-Za-z_]/.test(token) &&
        !table &&
        token !== "json_each" &&
        upper !== "SET"
      )
        throw new Error("Private query references an unscoped table");
      previous = upper;
      if (seat !== 1 && table && (isTable || next === "."))
        return `member${seat}_${token}`;
      return token;
    })
    .join("");
}
export function privateDatabase(
  DB: PrivateDatabase,
  seat: number,
  accountId?: string,
): PrivateDatabase {
  partitionSQL("", seat);
  const real = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const guard = () =>
    DB.prepare(
      "SELECT CASE WHEN EXISTS(SELECT 1 FROM accounts WHERE seat=? AND id=? AND status IN ('owner','active')) THEN 1 ELSE json_extract('revoked account','$') END AS valid",
    ).bind(seat, accountId!);
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    const proxy = new Proxy(statement, {
      get(target, property) {
        if (property === "bind")
          return (...args: unknown[]) => wrap(target.bind(...args));
        if (
          accountId &&
          ["run", "all", "first", "raw"].includes(String(property))
        )
          return async (...args: unknown[]) => {
            const result = (
              await DB.batch<Record<string, unknown>>([guard(), target])
            )[1];
            if (property === "first") {
              const row = result.results[0] ?? null;
              return args[0] && row ? row[String(args[0])] : row;
            }
            if (property === "raw") {
              const rows = result.results.map((row) => Object.values(row));
              return (args[0] as { columnNames?: boolean } | undefined)
                ?.columnNames
                ? [Object.keys(result.results[0] ?? {}), ...rows]
                : rows;
            }
            return result;
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    real.set(proxy, statement);
    return proxy;
  }
  return {
    prepare(sql: string) {
      return wrap(DB.prepare(partitionSQL(sql, seat)));
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      const native = statements.map(
        (statement) => real.get(statement) ?? statement,
      );
      const result = await DB.batch<T>(
        accountId ? [guard(), ...native] : native,
      );
      return accountId ? result.slice(1) : result;
    },
  };
}
