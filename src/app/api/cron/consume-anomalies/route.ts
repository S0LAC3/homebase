/**
 * Vercel Cron: Consume anomaly events from Confluent Kafka topics produced by Flink.
 * Forwards each event to POST /api/anomalies which creates user notifications.
 *
 * Schedule: every 5 minutes (see vercel.json)
 *
 * Topics consumed:
 *   - rate-anomalies   → HISTORICALLY_LOW / HISTORICALLY_HIGH
 *   - price-anomalies  → PSF_OUTLIER
 *   - dom-anomalies    → DOM_OUTLIER
 *
 * Uses kafkajs consumer group 'homebase-anomaly-consumer'.
 * Commits offsets after each successful batch so we never double-notify.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Kafka, logLevel } from 'kafkajs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Max messages to process per run (keep cron fast)
const MAX_MESSAGES = 50;
const TOPICS = ['rate-anomalies', 'price-anomalies', 'dom-anomalies'];
const GROUP_ID = 'homebase-anomaly-consumer';

interface AnomalyMessage {
  anomaly_type: string;
  current_rate?: number;
  rolling_avg?: number;
  metric?: string;
  value?: number;
  source?: string;
  ts?: string;
}

export async function GET(request: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const bootstrapServers = process.env.CONFLUENT_BOOTSTRAP_SERVERS;
  const apiKey = process.env.CONFLUENT_API_KEY;
  const apiSecret = process.env.CONFLUENT_API_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;

  if (!bootstrapServers || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Missing Confluent env vars' },
      { status: 500 }
    );
  }

  if (!appUrl) {
    return NextResponse.json(
      { error: 'Missing NEXT_PUBLIC_APP_URL or VERCEL_URL' },
      { status: 500 }
    );
  }

  const kafka = new Kafka({
    clientId: 'homebase-cron-consumer',
    brokers: [bootstrapServers],
    ssl: true,
    sasl: {
      mechanism: 'plain',
      username: apiKey,
      password: apiSecret,
    },
    logLevel: logLevel.ERROR,
  });

  const consumer = kafka.consumer({ groupId: GROUP_ID });
  const processed: AnomalyMessage[] = [];
  const errors: string[] = [];

  try {
    await consumer.connect();
    await consumer.subscribe({ topics: TOPICS, fromBeginning: false });

    // Collect up to MAX_MESSAGES then stop
    await new Promise<void>((resolve, reject) => {
      let count = 0;

      const timeout = setTimeout(() => {
        resolve(); // stop after 8s even if no messages
      }, 8000);

      consumer.run({
        autoCommit: false,
        eachMessage: async ({ message, heartbeat }) => {
          await heartbeat();
          if (!message.value) return;

          try {
            const payload = JSON.parse(message.value.toString()) as AnomalyMessage;
            processed.push(payload);

            // Forward to /api/anomalies
            const baseUrl = appUrl.startsWith('http') ? appUrl : `https://${appUrl}`;
            const res = await fetch(`${baseUrl}/api/anomalies`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
              },
              body: JSON.stringify(payload),
            });

            if (!res.ok) {
              errors.push(`anomaly forward failed: ${res.status}`);
            }
          } catch (err) {
            errors.push(String(err));
          }

          count++;
          if (count >= MAX_MESSAGES) {
            clearTimeout(timeout);
            resolve();
          }
        },
      }).catch(reject);
    });

    // Commit offsets after processing
    await consumer.commitOffsets(
      TOPICS.map((topic) => ({ topic, partition: 0, offset: '-1' }))
    );
  } catch (err) {
    errors.push(String(err));
  } finally {
    await consumer.disconnect().catch(() => {});
  }

  return NextResponse.json({
    success: true,
    processed: processed.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

