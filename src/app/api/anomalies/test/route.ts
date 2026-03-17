/**
 * GET /api/anomalies/test
 *
 * Manually triggers a test anomaly event:
 * - Publishes a test message to the mortgage-rates Kafka topic
 * - Creates a test notification for all users with active rate alerts
 *
 * Protected by CRON_SECRET (Bearer token in Authorization header).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publishToKafka } from '@/lib/confluent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Protect with CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Publish test anomaly event to Kafka
  const testEvent = {
    anomaly_type: 'HISTORICALLY_LOW',
    current_rate: 5.75,
    rolling_avg_52w: 6.82,
    deviation_from_avg: -1.07,
    source: 'test',
    timestamp: new Date().toISOString(),
  };

  await publishToKafka('mortgage-rates', testEvent, `test-${Date.now()}`);

  // Create test notification for all users with active rate alerts
  const { data: alerts } = await supabase
    .from('rate_alerts')
    .select('user_id')
    .eq('is_active', true);

  const userIds = [...new Set((alerts ?? []).map((a: { user_id: string }) => a.user_id))];

  let notified = 0;

  if (userIds.length > 0) {
    const notifications = userIds.map((userId) => ({
      user_id: userId,
      type: 'anomaly',
      title: '⚡ Test Anomaly: HISTORICALLY_LOW',
      body: `[TEST] Mortgage rates are at a historically low level. Current rate: 5.75% (52-week avg: 6.82%).`,
      metadata: {
        anomaly_type: 'HISTORICALLY_LOW',
        current_rate: 5.75,
        rolling_avg: 6.82,
        source: 'test',
        is_test: true,
        timestamp: testEvent.timestamp,
      },
    }));

    const { error } = await supabase.from('notifications').insert(notifications);
    if (error) {
      console.error('[anomalies/test] Failed to insert test notifications:', error);
    } else {
      notified = userIds.length;
    }
  }

  return NextResponse.json({
    success: true,
    message: 'Test anomaly triggered',
    kafkaEvent: testEvent,
    notified,
  });
}
