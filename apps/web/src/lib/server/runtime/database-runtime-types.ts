import type { RealPreviewResult } from "@/lib/server/preview/real-preview-types";

export type DatabaseType =
  | "mariadb"
  | "mongodb"
  | "mysql"
  | "postgresql"
  | "redis"
  | "sql_server"
  | "sqlite"
  | "unknown";

export type DatabaseOrmType =
  | "django_orm"
  | "drizzle"
  | "entity_framework"
  | "mikroorm"
  | "mongoose"
  | "prisma"
  | "sequelize"
  | "sqlalchemy"
  | "typeorm"
  | "unknown";

export type DatabaseArchitectureStyle =
  | "document_store"
  | "key_value_cache"
  | "orm_models"
  | "relational_schema"
  | "repository_queries"
  | "unknown";

export type DatabaseFrameworkMatch = {
  confidence: number;
  databaseType: DatabaseType;
  displayName: string;
  ormType: DatabaseOrmType;
  signals: string[];
};

export type DatabaseColumn = {
  defaultValue?: string;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isPrimaryKey?: boolean;
  name: string;
  tableName: string;
  type?: string;
};

export type DatabaseRelationship = {
  fromColumn?: string;
  fromTable: string;
  kind: "belongs_to" | "has_many" | "has_one" | "many_to_many" | "references" | "unknown";
  source: "orm" | "sql" | "static_hint";
  toColumn?: string;
  toTable: string;
};

export type DatabaseRuntimeAnalysis = {
  architectureStyle: DatabaseArchitectureStyle;
  columns: DatabaseColumn[];
  databaseType: DatabaseType;
  enums: string[];
  foreignKeys: string[];
  indexes: string[];
  migrationCount: number;
  migrations: string[];
  modelCount: number;
  models: string[];
  ormType: DatabaseOrmType;
  primaryKeys: string[];
  procedures: string[];
  queries: string[];
  queryCount: number;
  relationships: DatabaseRelationship[];
  repositories: string[];
  seeders: string[];
  tableCount: number;
  tables: string[];
  views: string[];
};

export type DatabaseRuntimeMetadata = {
  architectureStyle: DatabaseArchitectureStyle;
  databaseDisplayName: string;
  databaseType: DatabaseType;
  migrationCount: number;
  modelCount: number;
  ormDisplayName: string;
  ormType: DatabaseOrmType;
  queryCount: number;
  relationshipCount: number;
  tableCount: number;
};

export type DatabaseRuntimeEngineResult = {
  analysis: DatabaseRuntimeAnalysis;
  detected: boolean;
  match: DatabaseFrameworkMatch;
  metadata: DatabaseRuntimeMetadata;
  realPreview: RealPreviewResult | null;
  warnings: string[];
};
