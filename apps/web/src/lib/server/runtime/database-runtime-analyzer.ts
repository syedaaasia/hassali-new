import type {
  DatabaseArchitectureStyle,
  DatabaseColumn,
  DatabaseFrameworkMatch,
  DatabaseRelationship,
  DatabaseRuntimeAnalysis
} from "@/lib/server/runtime/database-runtime-types";

function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

function allText(files: Record<string, string>) {
  return Object.values(files).join("\n").slice(0, 500_000);
}

function unique(values: string[], limit = 30) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

function pathsMatching(files: Record<string, string>, pattern: RegExp) {
  return unique(Object.keys(files).filter((filePath) => pattern.test(normalizePath(filePath))), 40);
}

function terms(text: string, candidates: string[]) {
  const lower = text.toLowerCase();

  return unique(candidates.filter((candidate) => lower.includes(candidate.toLowerCase())));
}

function cleanIdentifier(value: string) {
  return value.replace(/[`"[\]]/g, "").replace(/^\w+\./, "").trim();
}

function extractSqlTables(text: string) {
  const tables: string[] = [];
  const columns: DatabaseColumn[] = [];
  const primaryKeys: string[] = [];
  const foreignKeys: string[] = [];
  const relationships: DatabaseRelationship[] = [];
  const tablePattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`"[]?[\w.]+[`"\]]?)\s*\(([\s\S]*?)\)\s*;/gi;

  for (const match of text.matchAll(tablePattern)) {
    const tableName = cleanIdentifier(match[1] ?? "");
    const body = match[2] ?? "";
    if (!tableName) continue;
    tables.push(tableName);

    for (const rawLine of body.split(/\n|,(?![^(]*\))/)) {
      const line = rawLine.trim();
      const columnMatch = line.match(/^([`"[]?\w+[`"\]]?)\s+([a-zA-Z][\w\s()[\],]*)/);
      if (!columnMatch || /^(constraint|primary|foreign|unique|index|key)\b/i.test(line)) {
        const fkMatch = line.match(/foreign\s+key\s*\(([^)]+)\)\s+references\s+([`"[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/i);
        if (fkMatch) {
          const fromColumn = cleanIdentifier(fkMatch[1] ?? "");
          const toTable = cleanIdentifier(fkMatch[2] ?? "");
          const toColumn = cleanIdentifier(fkMatch[3] ?? "");
          foreignKeys.push(`${tableName}.${fromColumn} -> ${toTable}.${toColumn}`);
          relationships.push({
            fromColumn,
            fromTable: tableName,
            kind: "references",
            source: "sql",
            toColumn,
            toTable
          });
        }
        continue;
      }

      const columnName = cleanIdentifier(columnMatch[1] ?? "");
      const type = (columnMatch[2] ?? "").replace(/\s+(primary|not|null|references|default).*$/i, "").trim();
      const isPrimaryKey = /primary\s+key/i.test(line);
      const inlineReference = line.match(/references\s+([`"[]?[\w.]+[`"\]]?)\s*\(([^)]+)\)/i);
      columns.push({
        isForeignKey: Boolean(inlineReference),
        isNullable: !/not\s+null/i.test(line),
        isPrimaryKey,
        name: columnName,
        tableName,
        type
      });
      if (isPrimaryKey) primaryKeys.push(`${tableName}.${columnName}`);
      if (inlineReference) {
        const toTable = cleanIdentifier(inlineReference[1] ?? "");
        const toColumn = cleanIdentifier(inlineReference[2] ?? "");
        foreignKeys.push(`${tableName}.${columnName} -> ${toTable}.${toColumn}`);
        relationships.push({
          fromColumn: columnName,
          fromTable: tableName,
          kind: "references",
          source: "sql",
          toColumn,
          toTable
        });
      }
    }
  }

  return { columns, foreignKeys, primaryKeys, relationships, tables };
}

function extractPrisma(text: string) {
  const tables: string[] = [];
  const columns: DatabaseColumn[] = [];
  const primaryKeys: string[] = [];
  const foreignKeys: string[] = [];
  const relationships: DatabaseRelationship[] = [];
  const enums: string[] = [];

  for (const match of text.matchAll(/enum\s+(\w+)\s*\{/g)) {
    enums.push(match[1] ?? "");
  }

  for (const match of text.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\}/g)) {
    const modelName = match[1] ?? "";
    const body = match[2] ?? "";
    if (!modelName) continue;
    tables.push(modelName);

    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      const field = line.match(/^(\w+)\s+([\w[\]?]+)(.*)$/);
      if (!field || line.startsWith("//") || line.startsWith("@@")) continue;

      const name = field[1] ?? "";
      const type = field[2] ?? "";
      const attributes = field[3] ?? "";
      const isPrimaryKey = attributes.includes("@id");
      const relation = attributes.includes("@relation") || /^[A-Z]/.test(type.replace(/\[\]|\?/g, ""));
      columns.push({
        isForeignKey: attributes.includes("fields:") || relation,
        isNullable: type.includes("?"),
        isPrimaryKey,
        name,
        tableName: modelName,
        type
      });
      if (isPrimaryKey) primaryKeys.push(`${modelName}.${name}`);
      if (relation) {
        const target = type.replace(/\[\]|\?/g, "");
        if (target && target !== modelName) {
          foreignKeys.push(`${modelName}.${name} -> ${target}`);
          relationships.push({
            fromColumn: name,
            fromTable: modelName,
            kind: type.includes("[]") ? "has_many" : "belongs_to",
            source: "orm",
            toTable: target
          });
        }
      }
    }
  }

  return { columns, enums, foreignKeys, primaryKeys, relationships, tables };
}

function extractOrmModels(text: string) {
  const classNames = unique([
    ...Array.from(text.matchAll(/@Entity\(["'`]?(\w+)?["'`]?\)?\s*(?:export\s+)?class\s+(\w+)/g)).map((match) => match[1] || match[2] || ""),
    ...Array.from(text.matchAll(/class\s+(\w+)\s*\(\s*models\.Model\s*\)/g)).map((match) => match[1] ?? ""),
    ...Array.from(text.matchAll(/class\s+(\w+)\(.*db\.Model.*\)/g)).map((match) => match[1] ?? ""),
    ...Array.from(text.matchAll(/class\s+(\w+).*DbContext/g)).map((match) => match[1] ?? ""),
    ...Array.from(text.matchAll(/DbSet<(\w+)>/g)).map((match) => match[1] ?? ""),
    ...Array.from(text.matchAll(/mongoose\.model\(["'`](\w+)["'`]/g)).map((match) => match[1] ?? ""),
    ...Array.from(text.matchAll(/model\(["'`](\w+)["'`]/g)).map((match) => match[1] ?? ""),
    ...Array.from(text.matchAll(/(?:pgTable|mysqlTable|sqliteTable)\(["'`](\w+)["'`]/g)).map((match) => match[1] ?? ""),
    ...Array.from(text.matchAll(/sequelize\.define\(["'`](\w+)["'`]/g)).map((match) => match[1] ?? "")
  ]);

  return classNames;
}

function extractQueries(text: string) {
  return unique([
    ...Array.from(text.matchAll(/\b(select|insert\s+into|update|delete\s+from)\s+[\w"`.[\]]+/gi)).map((match) => match[0] ?? ""),
    ...Array.from(text.matchAll(/\bprisma\.(\w+)\.(findMany|findUnique|create|update|delete|upsert)\b/g)).map((match) => `prisma.${match[1]}.${match[2]}`),
    ...Array.from(text.matchAll(/\b(\w+)\.(find|findOne|aggregate|create|updateOne|deleteOne)\(/g)).map((match) => `${match[1]}.${match[2]}`),
    ...Array.from(text.matchAll(/\bsession\.query\(([^)]+)\)/g)).map((match) => `session.query(${match[1]})`)
  ], 40);
}

function architectureStyle(input: {
  databaseType: string;
  models: string[];
  ormType: string;
  queries: string[];
  relationships: DatabaseRelationship[];
  tables: string[];
}): DatabaseArchitectureStyle {
  if (input.databaseType === "mongodb") return "document_store";
  if (input.databaseType === "redis") return "key_value_cache";
  if (input.ormType !== "unknown" && input.models.length) return "orm_models";
  if (input.tables.length || input.relationships.length) return "relational_schema";
  if (input.queries.length) return "repository_queries";

  return "unknown";
}

export function analyzeDatabaseRuntime(input: {
  files: Record<string, string>;
  match: DatabaseFrameworkMatch;
}): DatabaseRuntimeAnalysis {
  const text = allText(input.files);
  const sql = extractSqlTables(text);
  const prisma = extractPrisma(text);
  const ormModels = extractOrmModels(text);
  const migrations = pathsMatching(input.files, /(?:^|\/)(migrations?|drizzle|prisma\/migrations)\/.*\.(?:sql|ts|js|py|cs)$/i);
  const seeders = pathsMatching(input.files, /(?:^|\/)(seed|seeds|seeders?)\/.*\.(?:sql|ts|js|py|cs)$/i);
  const repositories = pathsMatching(input.files, /(?:repository|repositories|repo|dao|queries)\.(?:ts|js|py|cs|php|go|java)$/i);
  const tables = unique([...sql.tables, ...prisma.tables, ...ormModels]);
  const columns = [...sql.columns, ...prisma.columns].slice(0, 120);
  const relationships = [...sql.relationships, ...prisma.relationships].slice(0, 80);
  const queries = extractQueries(text);
  const indexes = unique([
    ...Array.from(text.matchAll(/create\s+(?:unique\s+)?index\s+([`"[]?\w+[`"\]]?)/gi)).map((match) => cleanIdentifier(match[1] ?? "")),
    ...Array.from(text.matchAll(/@@index\(\[([^\]]+)\]/g)).map((match) => `index(${match[1]})`),
    ...terms(text, ["@Index", "HasIndex", "index: true"])
  ]);
  const views = unique(Array.from(text.matchAll(/create\s+(?:or\s+replace\s+)?view\s+([`"[]?[\w.]+[`"\]]?)/gi)).map((match) => cleanIdentifier(match[1] ?? "")));
  const procedures = unique(Array.from(text.matchAll(/create\s+(?:or\s+replace\s+)?(?:procedure|function)\s+([`"[]?[\w.]+[`"\]]?)/gi)).map((match) => cleanIdentifier(match[1] ?? "")));
  const enums = unique([
    ...prisma.enums,
    ...Array.from(text.matchAll(/create\s+type\s+([`"[]?\w+[`"\]]?)\s+as\s+enum/gi)).map((match) => cleanIdentifier(match[1] ?? ""))
  ]);
  const primaryKeys = unique([...sql.primaryKeys, ...prisma.primaryKeys]);
  const foreignKeys = unique([...sql.foreignKeys, ...prisma.foreignKeys]);
  const models = unique([
    ...ormModels,
    ...pathsMatching(input.files, /(?:^|\/)(models?|entities?|collections?)\/.*\.(?:ts|js|py|cs|php|go|java)$/i)
  ]);
  const style = architectureStyle({
    databaseType: input.match.databaseType,
    models,
    ormType: input.match.ormType,
    queries,
    relationships,
    tables
  });

  return {
    architectureStyle: style,
    columns,
    databaseType: input.match.databaseType,
    enums,
    foreignKeys,
    indexes,
    migrationCount: migrations.length,
    migrations,
    modelCount: models.length,
    models,
    ormType: input.match.ormType,
    primaryKeys,
    procedures,
    queries,
    queryCount: queries.length,
    relationships,
    repositories,
    seeders,
    tableCount: tables.length,
    tables,
    views
  };
}
