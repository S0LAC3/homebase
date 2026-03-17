/**
 * Confluent Kafka REST Proxy helper.
 * Publishes messages to Confluent Cloud via the Kafka REST API (HTTP).
 * Works in Node.js serverless functions (not edge runtime).
 *
 * Required env vars:
 *   CONFLUENT_API_KEY     - Kafka API key (cluster-level)
 *   CONFLUENT_API_SECRET  - Kafka API secret
 *   CONFLUENT_REST_URL    - REST Proxy base URL (optional, defaults to bootstrap-derived URL)
 *   CONFLUENT_CLUSTER_ID  - Kafka cluster ID (optional, auto-discovered if omitted)
 */

const CONFLUENT_BASE =
  process.env.CONFLUENT_REST_URL ??
  'https://psrc-z27ovke.us-east1.gcp.confluent.cloud';

// Cache cluster ID in-memory across warm lambda invocations
let _clusterId: string | null = null;

function getAuth(): string {
  const apiKey = process.env.CONFLUENT_API_KEY;
  const apiSecret = process.env.CONFLUENT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('CONFLUENT_API_KEY and CONFLUENT_API_SECRET must be set');
  }
  return Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
}

async function getClusterId(): Promise<string> {
  if (_clusterId) return _clusterId;

  // Allow explicit override via env
  if (process.env.CONFLUENT_CLUSTER_ID) {
    _clusterId = process.env.CONFLUENT_CLUSTER_ID;
    return _clusterId;
  }

  const res = await fetch(`${CONFLUENT_BASE}/kafka/v3/clusters`, {
    headers: {
      Authorization: `Basic ${getAuth()}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to fetch Confluent cluster list (${res.status}): ${text}`
    );
  }

  const json = (await res.json()) as {
    data?: Array<{ cluster_id: string }>;
  };

  const id = json.data?.[0]?.cluster_id;
  if (!id) {
    throw new Error('No Confluent cluster found in response');
  }

  _clusterId = id;
  return id;
}

/**
 * Publish a message to a Confluent Kafka topic via REST Proxy.
 * Silently logs errors (does not throw) to avoid breaking the main cron flow.
 */
export async function publishToKafka(
  topic: string,
  value: unknown,
  key?: string
): Promise<void> {
  try {
    const clusterId = await getClusterId();
    const auth = getAuth();

    const url = `${CONFLUENT_BASE}/kafka/v3/clusters/${clusterId}/topics/${topic}/records`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        key: { type: 'STRING', data: key ?? topic },
        value: { type: 'JSON', data: value },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[confluent] Failed to publish to ${topic} (${res.status}): ${text}`
      );
    } else {
      console.log(`[confluent] Published event to ${topic}`);
    }
  } catch (err) {
    // Non-fatal: log and continue — cron must not fail due to Confluent issues
    console.error(`[confluent] publishToKafka error for ${topic}:`, err);
  }
}
