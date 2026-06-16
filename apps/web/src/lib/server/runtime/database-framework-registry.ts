import type {
  DatabaseFrameworkMatch,
  DatabaseOrmType,
  DatabaseType
} from "@/lib/server/runtime/database-runtime-types";

type DatabaseRegistryEntry = {
  databaseType: DatabaseType;
  displayName: string;
  ormType: DatabaseOrmType;
  patterns: RegExp[];
  terms: string[];
};

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").toLowerCase();
}

function filePaths(files: Record<string, string>) {
  return Object.keys(files).map(normalizePath);
}

function allText(files: Record<string, string>) {
  return Object.entries(files)
    .map(([path, content]) => `${path}\n${content.slice(0, 8000)}`)
    .join("\n")
    .toLowerCase();
}

function score(entry: DatabaseRegistryEntry, files: Record<string, string>): DatabaseFrameworkMatch {
  const paths = filePaths(files);
  const text = allText(files);
  const fileSignals = entry.patterns
    .filter((pattern) => paths.some((path) => pattern.test(path)))
    .map((pattern) => `file:${pattern.source}`);
  const termSignals = entry.terms
    .filter((term) => text.includes(term.toLowerCase()))
    .map((term) => `term:${term}`);

  return {
    confidence: Math.min(0.99, fileSignals.length * 0.26 + termSignals.length * 0.14),
    databaseType: entry.databaseType,
    displayName: entry.displayName,
    ormType: entry.ormType,
    signals: [...fileSignals, ...termSignals]
  };
}

const registry: DatabaseRegistryEntry[] = [
  {
    databaseType: "unknown",
    displayName: "Prisma schema",
    ormType: "prisma",
    patterns: [/(^|\/)schema\.prisma$/, /(^|\/)prisma\/.*\.(?:prisma|sql)$/],
    terms: ["generator client", "datasource db", "@prisma/client", "model ", "@relation"]
  },
  {
    databaseType: "unknown",
    displayName: "Drizzle ORM",
    ormType: "drizzle",
    patterns: [/(^|\/)drizzle\/.*\.(?:sql|ts|js)$/, /(^|\/)drizzle\.config\.(?:ts|js|mjs|cjs)$/],
    terms: ["drizzle-orm", "pgTable", "mysqlTable", "sqliteTable", "relations("]
  },
  {
    databaseType: "unknown",
    displayName: "TypeORM",
    ormType: "typeorm",
    patterns: [/(^|\/)(entities|entity|models)\/.*\.(?:ts|js)$/, /typeorm.*\.(?:ts|js|json)$/],
    terms: ["typeorm", "@Entity", "@Column", "DataSource", "Repository<"]
  },
  {
    databaseType: "unknown",
    displayName: "Sequelize",
    ormType: "sequelize",
    patterns: [/(^|\/)(models|migrations|seeders)\/.*\.(?:ts|js)$/],
    terms: ["sequelize", "Model.init", "sequelize.define", "queryInterface"]
  },
  {
    databaseType: "unknown",
    displayName: "MikroORM",
    ormType: "mikroorm",
    patterns: [/(^|\/)mikro-orm\.config\.(?:ts|js)$/, /(^|\/)(entities|entity)\/.*\.(?:ts|js)$/],
    terms: ["@mikro-orm", "MikroORM", "@Entity", "EntityRepository"]
  },
  {
    databaseType: "mongodb",
    displayName: "Mongoose / MongoDB",
    ormType: "mongoose",
    patterns: [/(^|\/)(models|schemas|collections)\/.*\.(?:ts|js)$/, /(^|\/).*mongo.*\.(?:ts|js|json)$/],
    terms: ["mongoose", "new Schema", "model(", "mongodb", "ObjectId"]
  },
  {
    databaseType: "unknown",
    displayName: "SQLAlchemy",
    ormType: "sqlalchemy",
    patterns: [/(^|\/)(models|database|db)\/.*\.py$/, /(^|\/)alembic\/.*\.py$/],
    terms: ["sqlalchemy", "declarative_base", "Column(", "relationship(", "ForeignKey("]
  },
  {
    databaseType: "unknown",
    displayName: "Django ORM",
    ormType: "django_orm",
    patterns: [/(^|\/)models\.py$/, /(^|\/)migrations\/.*\.py$/],
    terms: ["django.db", "models.Model", "ForeignKey(", "ManyToManyField("]
  },
  {
    databaseType: "unknown",
    displayName: "Entity Framework",
    ormType: "entity_framework",
    patterns: [/(^|\/).*dbcontext\.cs$/, /(^|\/)migrations\/.*\.cs$/],
    terms: ["DbContext", "DbSet<", "HasOne(", "HasMany(", "EntityFrameworkCore"]
  },
  {
    databaseType: "postgresql",
    displayName: "PostgreSQL",
    ormType: "unknown",
    patterns: [/(^|\/)migrations\/.*\.sql$/, /\.sql$/],
    terms: ["postgresql", "postgres", "serial primary key", "uuid_generate_v4", "jsonb", "timestamptz"]
  },
  {
    databaseType: "mysql",
    displayName: "MySQL",
    ormType: "unknown",
    patterns: [/(^|\/)migrations\/.*\.sql$/, /\.sql$/],
    terms: ["mysql", "engine=innodb", "auto_increment", "unsigned", "varchar(255)"]
  },
  {
    databaseType: "mariadb",
    displayName: "MariaDB",
    ormType: "unknown",
    patterns: [/(^|\/)migrations\/.*\.sql$/, /\.sql$/],
    terms: ["mariadb", "engine=aria", "engine=innodb"]
  },
  {
    databaseType: "sqlite",
    displayName: "SQLite",
    ormType: "unknown",
    patterns: [/(^|\/).*sqlite.*$/, /\.sql$/],
    terms: ["sqlite", "sqlite3", "integer primary key autoincrement"]
  },
  {
    databaseType: "sql_server",
    displayName: "SQL Server",
    ormType: "unknown",
    patterns: [/(^|\/)migrations\/.*\.sql$/, /\.sql$/],
    terms: ["sql server", "mssql", "nvarchar", "identity(1,1)", "dbo."]
  },
  {
    databaseType: "redis",
    displayName: "Redis",
    ormType: "unknown",
    patterns: [/(^|\/).*redis.*\.(?:ts|js|py|go|java|cs|php|json)$/],
    terms: ["redis", "ioredis", "createClient", "hset", "zadd", "cache key"]
  }
];

function inferDatabaseType(files: Record<string, string>, current: DatabaseType): DatabaseType {
  if (current !== "unknown") return current;

  const text = allText(files);
  const provider = text.match(/provider\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();

  if (provider?.includes("postgres")) return "postgresql";
  if (provider?.includes("mysql")) return "mysql";
  if (provider?.includes("sqlite")) return "sqlite";
  if (provider?.includes("sqlserver")) return "sql_server";
  if (text.includes("pgtable") || text.includes("postgresql") || text.includes("postgres")) return "postgresql";
  if (text.includes("mysqltable") || text.includes("mysql")) return "mysql";
  if (text.includes("sqlitetable") || text.includes("sqlite")) return "sqlite";
  if (text.includes("mongoose") || text.includes("mongodb")) return "mongodb";
  if (text.includes("redis") || text.includes("ioredis")) return "redis";

  return "unknown";
}

export function getDatabaseFrameworkRegistry() {
  return registry;
}

export function databaseTypeLabel(type: DatabaseType) {
  const labels: Record<DatabaseType, string> = {
    mariadb: "MariaDB",
    mongodb: "MongoDB",
    mysql: "MySQL",
    postgresql: "PostgreSQL",
    redis: "Redis",
    sql_server: "SQL Server",
    sqlite: "SQLite",
    unknown: "Unknown database"
  };

  return labels[type];
}

export function ormTypeLabel(type: DatabaseOrmType) {
  const labels: Record<DatabaseOrmType, string> = {
    django_orm: "Django ORM",
    drizzle: "Drizzle ORM",
    entity_framework: "Entity Framework",
    mikroorm: "MikroORM",
    mongoose: "Mongoose",
    prisma: "Prisma",
    sequelize: "Sequelize",
    sqlalchemy: "SQLAlchemy",
    typeorm: "TypeORM",
    unknown: "No ORM detected"
  };

  return labels[type];
}

export function detectDatabaseFramework(files: Record<string, string>): DatabaseFrameworkMatch {
  const match = registry.map((entry) => score(entry, files)).sort((a, b) => b.confidence - a.confidence)[0];

  if (!match || match.confidence < 0.24) {
    return {
      confidence: 0.18,
      databaseType: "unknown",
      displayName: "Unknown database",
      ormType: "unknown",
      signals: []
    };
  }

  const databaseType = inferDatabaseType(files, match.databaseType);
  const displayName = match.ormType !== "unknown"
    ? `${ormTypeLabel(match.ormType)}${databaseType !== "unknown" ? ` on ${databaseTypeLabel(databaseType)}` : ""}`
    : databaseTypeLabel(databaseType);

  return {
    ...match,
    databaseType,
    displayName
  };
}
