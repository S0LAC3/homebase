/**
 * Confluent Flink SQL queries for the HomeBase anomaly detection pipeline.
 *
 * These queries run in Confluent's managed Flink compute pool, consuming from
 * Kafka topics and producing anomaly events back to Kafka (or a webhook sink).
 *
 * Topics:
 *   - mortgage-rates          (source)
 *   - market-data-seattle     (source)
 *   - rate-anomalies          (sink)
 *   - price-anomalies         (sink)
 *   - dom-anomalies           (sink)
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
    id: 'rolling-avg',
    title: '52-Week Rolling Average',
    description:
      'Computes a rolling 52-week average mortgage rate using a windowed aggregation over the real-time stream.',
    sql: `-- 1. Rolling 52-week average mortgage rate
CREATE TABLE mortgage_rate_averages AS
SELECT
  AVG(rate_30yr_fixed) OVER (
    ORDER BY PROCTIME()
    RANGE BETWEEN INTERVAL '52' WEEK PRECEDING AND CURRENT ROW
  ) AS rolling_avg_52w,
  rate_30yr_fixed AS current_rate,
  rate_30yr_fixed - AVG(rate_30yr_fixed) OVER (
    ORDER BY PROCTIME()
    RANGE BETWEEN INTERVAL '52' WEEK PRECEDING AND CURRENT ROW
  ) AS deviation_from_avg
FROM mortgage_rates_stream;`,
  },
  {
    id: 'rate-anomaly',
    title: 'Rate Anomaly Detection',
    description:
      'Flags rates that deviate more than 0.5% from the rolling average as HISTORICALLY_LOW or HISTORICALLY_HIGH.',
    sql: `-- 2. Rate anomaly detection (>0.5% deviation triggers alert)
CREATE TABLE rate_anomalies AS
SELECT *,
  CASE
    WHEN current_rate < rolling_avg_52w - 0.5 THEN 'HISTORICALLY_LOW'
    WHEN current_rate > rolling_avg_52w + 0.5 THEN 'HISTORICALLY_HIGH'
    ELSE 'NORMAL'
  END AS anomaly_type
FROM mortgage_rate_averages
WHERE ABS(current_rate - rolling_avg_52w) > 0.5;`,
  },
  {
    id: 'psf-outlier',
    title: '$/sqft Outlier Detection',
    description:
      'Detects properties priced more than 15% below the median $/sqft for their zip code — potential deals.',
    sql: `-- 3. $/sqft outlier detection per metro
CREATE TABLE price_per_sqft_anomalies AS
SELECT
  property_id,
  address,
  price / sqft AS price_per_sqft,
  AVG(price / sqft) OVER (PARTITION BY zip_code) AS median_psf_zip,
  (price / sqft) - AVG(price / sqft) OVER (PARTITION BY zip_code) AS psf_deviation
FROM properties_stream
WHERE (price / sqft) < AVG(price / sqft) OVER (PARTITION BY zip_code) * 0.85;`,
  },
  {
    id: 'dom-outlier',
    title: 'Days on Market Outliers',
    description:
      'Identifies listings sitting 50% longer than the 6-month rolling average — potential motivated sellers.',
    sql: `-- 4. Days on market outliers (potential motivated seller)
CREATE TABLE dom_outliers AS
SELECT *
FROM market_data_stream
WHERE days_on_market > AVG(days_on_market) OVER (
  ORDER BY PROCTIME()
  RANGE BETWEEN INTERVAL '6' MONTH PRECEDING AND CURRENT ROW
) * 1.5;`,
  },
];

/** Flink compute pool configuration (read from env) */
export const FLINK_CONFIG = {
  cloudProvider: 'AWS',
  region: 'us-west-2',
  computePool: process.env.CONFLUENT_FLINK_POOL_ID ?? null,
  environmentId: process.env.CONFLUENT_ENV_ID ?? null,
};
