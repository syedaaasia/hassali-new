import { mapDatabaseRelationshipPreview } from "@/lib/server/runtime/database-relationship-mapper";
import {
  databaseTypeLabel,
  detectDatabaseFramework,
  ormTypeLabel
} from "@/lib/server/runtime/database-framework-registry";
import { analyzeDatabaseRuntime } from "@/lib/server/runtime/database-runtime-analyzer";
import type { DatabaseRuntimeEngineResult } from "@/lib/server/runtime/database-runtime-types";

export function buildDatabaseRuntimeEngine(files: Record<string, string>): DatabaseRuntimeEngineResult {
  const match = detectDatabaseFramework(files);
  const detected = match.databaseType !== "unknown" || match.ormType !== "unknown";
  const analysis = analyzeDatabaseRuntime({ files, match });
  const realPreview = detected
    ? mapDatabaseRelationshipPreview({ analysis, match })
    : null;

  return {
    analysis,
    detected,
    match,
    metadata: {
      architectureStyle: analysis.architectureStyle,
      databaseDisplayName: databaseTypeLabel(match.databaseType),
      databaseType: match.databaseType,
      migrationCount: analysis.migrationCount,
      modelCount: analysis.modelCount,
      ormDisplayName: ormTypeLabel(match.ormType),
      ormType: match.ormType,
      queryCount: analysis.queryCount,
      relationshipCount: analysis.relationships.length,
      tableCount: analysis.tableCount
    },
    realPreview,
    warnings: detected
      ? ["Database runtime metadata was derived from project files without connecting to a database or running migrations."]
      : ["No supported database schema or ORM was detected."]
  };
}
