/**
 * Confluent Kafka helper using kafkajs.
 * Publishes messages to Confluent Cloud topics.
 * NOTE: kafkajs does NOT work in Vercel Edge runtime — always use `export const runtime = 'nodejs'`
 * in any route that imports this module.
 *
 * Required env vars:
 *   CONFLUENT_API_KEY           - Kafka API key
 *   CONFLUENT_API_SECRET        - Kafka API secret
 *   CONFLUENT_BOOTSTRAP_SERVERS - Bootstrap server (default: pkc-n98pk.us-west-2.aws.confluent.cloud:9092)
 */

import { Kafka, Producer, logLevel } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'homebase',
  brokers: [
    process.env.CONFLUENT_BOOTSTRAP_SERVERS ||
      'pkc-n98pk.us-west-2.aws.confluent.cloud:9092',
  ],
  ssl: true,
  sasl: {
    mechanism: 'plain',
    username: process.env.CONFLUENT_API_KEY || '',
    password: process.env.CONFLUENT_API_SECRET || '',
  },
  logLevel: logLevel.ERROR,
});

let producer: Producer | null = null;

async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
  }
  return producer;
}

/**
 * Publish a message to a Confluent Kafka topic via kafkajs.
 * Silently logs errors (does not throw) to avoid breaking the main cron flow.
 */
export async function publishToKafka(
  topic: string,
  value: unknown,
  key?: string
): Promise<void> {
  try {
    const p = await getProducer();
    await p.send({
      topic,
      messages: [{ key: key ?? topic, value: JSON.stringify(value) }],
    });
    console.log(`[Confluent] Published event to ${topic}`);
  } catch (error) {
    console.error('[Confluent] Failed to publish:', error);
    // Non-fatal - don't crash the cron
  }
}
