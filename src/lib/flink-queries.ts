/**
 * Confluent Flink SQL queries for the HomeBase anomaly detection pipeline.
 *
 * These queries run in Confluent's managed Flink compute pool.
 * Source tables use 'connector' = 'confluent' with JSON Schema Registry.
 *
 * Topics / tables:
 *   - mortgage_rates          (source — defined in Confluent)
 *   - market_data_seattle     (source — defined in Confluent)
 *   - rate_anomalies          (sink  → topic: rate-anomalies)
 *   - price_anomalies         (sink  → topic: price-anomalies)
 *   - dom_anomalies           (sink  → topic: dom-anomalies)
 */

/** Flink SQL snippet type — used for UI "How it works" display */
export interface FlinkQuery {
  id: string;
  title: string;
  description: string;
  sql: string;
}

export const FLINK_QUERIES: FlinkQuery[] = [
  {
    id: 'source-table',
    title: 'Source Table',
    description:
      'Kafka source table for mortgage rates. Uses the native Confluent connector with JSON Schema Registry and a watermarked event-time column.',
    sql: `-- Source table (already defined in Confluent)
CREATE TABLE mortgage_rates (
  rate_date    STRING,
  rate_30yr_fixed DOUBLE,
  rate_fha     DOUBLE,
  source       STRING,
  \`timestamp\` STRING,

  ts AS TO_TIMESTAMP(\`timestamp\`),
  WATERMARK FOR ts AS ts
) WITH (
  'connector'          = 'confluent',
  'scan.startup.mode'  = 'earliest-offset',
  'value.format'       = 'json-registry'
);`,
  },
  {
    id: 'sink-table',
    title: 'Sink Table',
    description:
      'Kafka sink table for anomaly events. Flink writes detected anomalies here; the app consumer reads from the rate-anomalies topic.',
    sql: `-- Sink table (create once in Confluent)
CREATE TABLE IF NOT EXISTS rate_anomalies (
  current_rate DOUBLE,
  rolling_avg  DOUBLE,
  deviation    DOUBLE,
  anomaly_type STRING
) WITH (
  'connector'    = 'confluent',
  'kafka.topic'  = 'rate-anomalies',
  'value.format' = 'json-registry'
);`,
  },
  {
    id: 'rate-anomaly',
    title: 'Rate Anomaly Detection',
    description:
      'Inserts into the sink when a rate deviates more than 0.5% from the 52-row rolling average. Flags as HISTORICALLY_LOW or HISTORICALLY_HIGH.',
    sql: `-- Continuous anomaly detection pipeline
INSERT INTO rate_anomalies
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
  {
    id: 'psf-outlier',
    title: '$/sqft Outlier Detection',
    description:
      'Detects properties priced more than 15% below the 30-day rolling median $/sqft for their zip code — potential deals.',
    sql: `-- $/sqft outlier detection per zip code
CREATE TABLE IF NOT EXISTS price_anomalies (
  anomaly_type STRING,
  metric       STRING,
  value        DOUBLE
) WITH (
  'connector'    = 'confluent',
  'kafka.topic'  = 'price-anomalies',
  'value.format' = 'json-registry'
);

INSERT INTO price_anomalies
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
  {
    id: 'dom-outlier',
    title: 'Days on Market Outliers',
    description:
      'Identifies listings sitting 50% longer than the 180-row rolling average — signals potential motivated sellers.',
    sql: `-- Days on market outlier detection
CREATE TABLE IF NOT EXISTS dom_anomalies (
  anomaly_type STRING,
  metric       STRING,
  value        DOUBLE
) WITH (
  'connector'    = 'confluent',
  'kafka.topic'  = 'dom-anomalies',
  'value.format' = 'json-registry'
);

INSERT INTO dom_anomalies
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

/** Flink compute pool configuration (read from env) */
export const FLINK_CONFIG = {
  cloudProvider: process.env.CONFLUENT_FLINK_CLOUD ?? 'aws',
  region: process.env.CONFLUENT_FLINK_REGION ?? 'us-west-2',
  computePool: process.env.CONFLUENT_FLINK_POOL_ID ?? null,
  environmentId: process.env.CONFLUENT_ENV_ID ?? null,
};
