/**
 * GET /api/flink/status
 *
 * Returns the current status of all HomeBase Flink SQL pipelines.
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listStatements } from '@/lib/flink-rest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PIPELINE_NAMES = [
  // DDL statements (CREATE TABLE — complete immediately)
  'homebase-rate-anomalies-ddl',
  'homebase-price-anomalies-ddl',
  'homebase-dom-anomalies-ddl',
  // DML statements (INSERT INTO — stay RUNNING continuously)
  'homebase-rate-anomalies-dml',
  'homebase-price-anomalies-dml',
  'homebase-dom-anomalies-dml',
];

const DML_NAMES = PIPELINE_NAMES.filter((n) => n.endsWith('-dml'));

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

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

  try {
    const all = await listStatements();
    const homebase = all.filter((s) => PIPELINE_NAMES.includes(s.name));

    const status = homebase.map((s) => ({
      name: s.name,
      phase: s.status?.phase ?? 'UNKNOWN',
      detail: s.status?.detail ?? null,
      created_at: s.metadata?.created_at ?? null,
    }));

    const allRunning = DML_NAMES.every(
      (name) => status.find((s) => s.name === name)?.phase === 'RUNNING'
    );

    return NextResponse.json({
      ready: allRunning,
      pipelines: status,
      missing_pipelines: PIPELINE_NAMES.filter(
        (name) => !status.find((s) => s.name === name)
      ),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
