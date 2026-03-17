/**
 * POST /api/anomalies
 *
 * Receives anomaly events from Confluent Flink (via webhook/connector).
 * Creates notifications in the notifications table for all users with active rate alerts.
 *
 * Body: { anomaly_type: string, current_rate?: number, rolling_avg?: number, metric?: string, value?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AnomalyEvent {
  anomaly_type: 'HISTORICALLY_LOW' | 'HISTORICALLY_HIGH' | 'PSF_OUTLIER' | 'DOM_OUTLIER' | string;
  current_rate?: number;
  rolling_avg?: number;
  metric?: string;
  value?: number;
  source?: string;
  timestamp?: string;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
  }

  let body: AnomalyEvent;
  try {
    body = (await request.json()) as AnomalyEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch all users with active rate alerts
  const { data: alerts, error: alertsError } = await supabase
    .from('rate_alerts')
    .select('user_id')
    .eq('is_active', true);

  if (alertsError) {
    console.error('[anomalies] Failed to fetch rate alerts:', alertsError);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }

  const userIds = [...new Set((alerts ?? []).map((a: { user_id: string }) => a.user_id))];

  if (userIds.length === 0) {
    return NextResponse.json({ success: true, notified: 0 });
  }

  const anomalyLabels: Record<string, string> = {
    HISTORICALLY_LOW: 'Mortgage rates are at a historically low level',
    HISTORICALLY_HIGH: 'Mortgage rates are at a historically high level',
    PSF_OUTLIER: 'A property is priced below typical $/sqft for its area',
    DOM_OUTLIER: 'A listing has been on the market unusually long (potential motivated seller)',
  };

  const label = anomalyLabels[body.anomaly_type] ?? `Anomaly detected: ${body.anomaly_type}`;
  const rateDetail =
    body.current_rate != null && body.rolling_avg != null
      ? ` Current rate: ${body.current_rate.toFixed(2)}% (52-week avg: ${body.rolling_avg.toFixed(2)}%).`
      : '';

  const notifications = userIds.map((userId) => ({
    user_id: userId,
    type: 'anomaly',
    title: `⚡ Market Anomaly: ${body.anomaly_type}`,
    body: `${label}.${rateDetail}`,
    metadata: {
      anomaly_type: body.anomaly_type,
      current_rate: body.current_rate ?? null,
      rolling_avg: body.rolling_avg ?? null,
      metric: body.metric ?? null,
      value: body.value ?? null,
      source: body.source ?? 'Confluent Flink',
      timestamp: body.timestamp ?? new Date().toISOString(),
    },
  }));

  const { error: notifError } = await supabase.from('notifications').insert(notifications);

  if (notifError) {
    console.error('[anomalies] Failed to insert notifications:', notifError);
    return NextResponse.json({ error: 'Failed to create notifications' }, { status: 500 });
  }

  return NextResponse.json({ success: true, notified: userIds.length });
}
