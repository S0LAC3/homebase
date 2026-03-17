/**
 * POST /api/flink/deploy
 *
 * Deploys HomeBase Flink SQL pipelines to the Confluent managed compute pool.
 * Uses the native 'confluent' connector (no manual SASL/SSL config needed).
 *
 * Each pipeline is split into two statements:
 *   1. DDL  — CREATE TABLE IF NOT EXISTS (sink table)
 *   2. DML  — INSERT INTO ... SELECT (continuous query)
 *
 * The source table (mortgage_rates) is assumed to already exist in Confluent.
 *
 * Protected by CRON_SECRET. Idempotent — skips RUNNING statements.
 * Pass { "redeploy": true } in the body to force a full teardown + redeploy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { submitStatement, listStatements, deleteStatement } from '@/lib/flink-rest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Each pipeline entry has:
 *  - ddlName  : statement name for the CREATE TABLE
 *  - dmlName  : statement name for the INSERT INTO
 *  - ddl      : sink table DDL  (uses 'connector' = 'confluent')
 *  - dml      : continuous INSERT INTO query
 */
const PIPELINES: Array<{ ddlName: string; dmlName: string; ddl: string; dml: string }> = [
  // ── 1. Rate anomaly detection ────────────────────────────────────────────
  {
    ddlName: 'homebase-rate-anomalies-ddl',
    dmlName: 'homebase-rate-anomalies-dml',
    ddl: `CREATE TABLE IF NOT EXISTS rate_anomalies (
  current_rate DOUBLE,
  rolling_avg  DOUBLE,
  deviation    DOUBLE,
  anomaly_type STRING
) WITH (
  'connector'    = 'confluent',
  'kafka.topic'  = 'rate-anomalies',
  'value.format' = 'json-registry'
);`,
    dml: `INSERT INTO rate_anomalies
SELECT
  current_rate,
  rolling_avg,
  current_rate - rolling_avg AS deviation,
  CASE
    WHEN current_rate < rolling_avg - 0.5 THEN 'HISTORICALLY_LOW'
    WHEN current_rate > rolling_avg + 0.5 THEN 'HISTORICALLY_HIGH'
    ELSE 'NORMAL'
  END AS anomaly_type
FROM (
  SELECT
    rate_30yr_fixed AS current_rate,
    AVG(rate_30yr_fixed) OVER (
      ORDER BY ts
      ROWS BETWEEN 52 PRECEDING AND CURRENT ROW
    ) AS rolling_avg
  FROM mortgage_rates
)
WHERE current_rate < rolling_avg - 0.5
   OR current_rate > rolling_avg + 0.5;`,
  },

  // ── 2. Price-per-sqft outlier detection ──────────────────────────────────
  {
    ddlName: 'homebase-price-anomalies-ddl',
    dmlName: 'homebase-price-anomalies-dml',
    ddl: `CREATE TABLE IF NOT EXISTS price_anomalies (
  anomaly_type STRING,
  metric       STRING,
  value        DOUBLE
) WITH (
  'connector'    = 'confluent',
  'kafka.topic'  = 'price-anomalies',
  'value.format' = 'json-registry'
);`,
    dml: `INSERT INTO price_anomalies
SELECT
  'PSF_OUTLIER'    AS anomaly_type,
  'price_per_sqft' AS metric,
  price / sqft     AS value
FROM market_data_seattle
WHERE sqft > 0
  AND price / sqft < AVG(price / sqft) OVER (
    PARTITION BY zip_code
    ORDER BY ts
    ROWS BETWEEN 30 PRECEDING AND CURRENT ROW
  ) * 0.85;`,
  },

  // ── 3. Days-on-market outlier detection ──────────────────────────────────
  {
    ddlName: 'homebase-dom-anomalies-ddl',
    dmlName: 'homebase-dom-anomalies-dml',
    ddl: `CREATE TABLE IF NOT EXISTS dom_anomalies (
  anomaly_type STRING,
  metric       STRING,
  value        DOUBLE
) WITH (
  'connector'    = 'confluent',
  'kafka.topic'  = 'dom-anomalies',
  'value.format' = 'json-registry'
);`,
    dml: `INSERT INTO dom_anomalies
SELECT
  'DOM_OUTLIER'    AS anomaly_type,
  'days_on_market' AS metric,
  CAST(days_on_market AS DOUBLE) AS value
FROM market_data_seattle
WHERE days_on_market > AVG(days_on_market) OVER (
    ORDER BY ts
    ROWS BETWEEN 180 PRECEDING AND CURRENT ROW
  ) * 1.5;`,
  },
];

// All statement names (DDL + DML) so we can check / delete them
const ALL_STATEMENT_NAMES = PIPELINES.flatMap((p) => [p.ddlName, p.dmlName]);

export async function POST(request: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Env check
  const missing = [
    'CONFLUENT_ENV_ID',
    'CONFLUENT_FLINK_POOL_ID',
    'CONFLUENT_ORG_ID',
    'CONFLUENT_FLINK_API_KEY',
    'CONFLUENT_FLINK_API_SECRET',
  ].filter((k) => !process.env[k]);

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing env vars: ${missing.join(', ')}` },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { redeploy?: boolean };
  const redeploy = body?.redeploy === true;

  // Fetch existing statements
  let existing: Awaited<ReturnType<typeof listStatements>> = [];
  try {
    existing = await listStatements();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  const existingByName = new Map(existing.map((s) => [s.name, s]));
  const results: Record<string, string> = {};

  for (const pipeline of PIPELINES) {
    // ── DDL statement ──────────────────────────────────────────────────────
    const existingDdl = existingByName.get(pipeline.ddlName);
    const ddlPhase = existingDdl?.status?.phase;

    if (ddlPhase === 'COMPLETED' && !redeploy) {
      // DDL (CREATE TABLE IF NOT EXISTS) completes immediately — normal
      results[pipeline.ddlName] = 'already-completed';
    } else {
      if (existingDdl && redeploy) {
        await deleteStatement(pipeline.ddlName).catch(() => {});
      }
      try {
        await submitStatement({ name: pipeline.ddlName, sql: pipeline.ddl });
        results[pipeline.ddlName] = 'submitted';
      } catch (err) {
        results[pipeline.ddlName] = `error: ${String(err)}`;
        console.error(`[flink/deploy] DDL failed for ${pipeline.ddlName}:`, err);
        // Don't submit DML if DDL failed
        results[pipeline.dmlName] = 'skipped (DDL failed)';
        continue;
      }
    }

    // ── DML statement (continuous INSERT INTO) ─────────────────────────────
    const existingDml = existingByName.get(pipeline.dmlName);
    const dmlPhase = existingDml?.status?.phase;

    if (dmlPhase === 'RUNNING' && !redeploy) {
      results[pipeline.dmlName] = 'already-running';
      continue;
    }

    if (existingDml && redeploy) {
      await deleteStatement(pipeline.dmlName).catch(() => {});
    }

    try {
      await submitStatement({ name: pipeline.dmlName, sql: pipeline.dml });
      results[pipeline.dmlName] = 'submitted';
      console.log(`[flink/deploy] Started pipeline: ${pipeline.dmlName}`);
    } catch (err) {
      results[pipeline.dmlName] = `error: ${String(err)}`;
      console.error(`[flink/deploy] DML failed for ${pipeline.dmlName}:`, err);
    }
  }

  const allRunning = ALL_STATEMENT_NAMES
    .filter((n) => n.endsWith('-dml'))
    .every((n) => results[n] === 'submitted' || results[n] === 'already-running');

  return NextResponse.json({ success: true, allRunning, statements: results });
}
