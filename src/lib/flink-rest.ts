/**
 * Confluent Flink REST API client.
 *
 * Uses the Confluent Cloud Flink SQL REST API to submit, monitor, and delete
 * Flink SQL statements in a managed compute pool.
 *
 * Docs: https://docs.confluent.io/cloud/current/flink/api.html
 *
 * Required env vars:
 *   CONFLUENT_FLINK_API_KEY     - Flink-scoped API key (different from Kafka key)
 *   CONFLUENT_FLINK_API_SECRET  - Flink-scoped API secret
 *   CONFLUENT_ENV_ID            - Confluent environment ID  (e.g. env-abc123)
 *   CONFLUENT_FLINK_POOL_ID     - Flink compute pool ID     (e.g. lfcp-abc123)
 *   CONFLUENT_ORG_ID            - Confluent organization ID (e.g. abc123-def456)
 *   CONFLUENT_FLINK_REGION      - e.g. us-west-2
 *   CONFLUENT_FLINK_CLOUD       - e.g. aws
 */

const BASE_URL = 'https://flink.{region}.{cloud}.confluent.cloud/sql/v1';

function flinkBaseUrl(): string {
  const region = process.env.CONFLUENT_FLINK_REGION ?? 'us-west-2';
  const cloud = process.env.CONFLUENT_FLINK_CLOUD ?? 'aws';
  return BASE_URL.replace('{region}', region).replace('{cloud}', cloud);
}

function authHeaders(): Record<string, string> {
  const key = process.env.CONFLUENT_FLINK_API_KEY ?? '';
  const secret = process.env.CONFLUENT_FLINK_API_SECRET ?? '';
  const token = Buffer.from(`${key}:${secret}`).toString('base64');
  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json',
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type StatementPhase =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILING'
  | 'FAILED'
  | 'DELETING'
  | 'STOPPED'
  | 'STOPPING';

export interface FlinkStatement {
  name: string;
  spec: {
    statement: string;
    compute_pool_id: string;
    properties?: Record<string, string>;
  };
  status?: {
    phase: StatementPhase;
    detail?: string;
  };
  metadata?: {
    created_at?: string;
    self?: string;
  };
}

export interface SubmitStatementOptions {
  /** Unique name for the statement (alphanumeric + hyphens, max 64 chars) */
  name: string;
  sql: string;
  /** Extra Flink properties, e.g. parallelism */
  properties?: Record<string, string>;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Submit a Flink SQL statement to the compute pool.
 * Returns the created statement object.
 */
export async function submitStatement(
  opts: SubmitStatementOptions
): Promise<FlinkStatement> {
  const envId = process.env.CONFLUENT_ENV_ID;
  const poolId = process.env.CONFLUENT_FLINK_POOL_ID;
  const orgId = process.env.CONFLUENT_ORG_ID;

  if (!envId || !poolId || !orgId) {
    throw new Error(
      'Missing Flink env vars: CONFLUENT_ENV_ID, CONFLUENT_FLINK_POOL_ID, CONFLUENT_ORG_ID'
    );
  }

  const url = `${flinkBaseUrl()}/organizations/${orgId}/environments/${envId}/statements`;

  const body: FlinkStatement = {
    name: opts.name,
    spec: {
      statement: opts.sql,
      compute_pool_id: poolId,
      properties: opts.properties ?? {},
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Flink submitStatement failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<FlinkStatement>;
}

/**
 * List all statements in the environment.
 */
export async function listStatements(): Promise<FlinkStatement[]> {
  const envId = process.env.CONFLUENT_ENV_ID;
  const orgId = process.env.CONFLUENT_ORG_ID;

  if (!envId || !orgId) {
    throw new Error('Missing CONFLUENT_ENV_ID or CONFLUENT_ORG_ID');
  }

  const url = `${flinkBaseUrl()}/organizations/${orgId}/environments/${envId}/statements`;
  const res = await fetch(url, { headers: authHeaders() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Flink listStatements failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { data: FlinkStatement[] };
  return json.data ?? [];
}

/**
 * Get the status of a specific statement by name.
 */
export async function getStatement(name: string): Promise<FlinkStatement> {
  const envId = process.env.CONFLUENT_ENV_ID;
  const orgId = process.env.CONFLUENT_ORG_ID;

  if (!envId || !orgId) {
    throw new Error('Missing CONFLUENT_ENV_ID or CONFLUENT_ORG_ID');
  }

  const url = `${flinkBaseUrl()}/organizations/${orgId}/environments/${envId}/statements/${name}`;
  const res = await fetch(url, { headers: authHeaders() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Flink getStatement failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<FlinkStatement>;
}

/**
 * Delete / stop a Flink SQL statement by name.
 */
export async function deleteStatement(name: string): Promise<void> {
  const envId = process.env.CONFLUENT_ENV_ID;
  const orgId = process.env.CONFLUENT_ORG_ID;

  if (!envId || !orgId) {
    throw new Error('Missing CONFLUENT_ENV_ID or CONFLUENT_ORG_ID');
  }

  const url = `${flinkBaseUrl()}/organizations/${orgId}/environments/${envId}/statements/${name}`;
  const res = await fetch(url, { method: 'DELETE', headers: authHeaders() });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Flink deleteStatement failed (${res.status}): ${text}`);
  }
}

