/**
 * Vercel Cron Job: Fetch latest mortgage rates from FRED and trigger alerts.
 * Schedule: every Monday at 9am (see vercel.json)
 *
 * CONFLUENT HOOK: In the full integration, this route would:
 *   1. Fetch from FRED
 *   2. Publish to Confluent Kafka topic 'mortgage-rates' via producer
 *   3. A separate Confluent consumer would handle DB writes + alert processing
 * For now, everything runs in this single route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchLatestRates } from '@/lib/fetch-rates';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    const bearer = `Bearer ${cronSecret}`;
    if (authHeader !== bearer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Fetch latest rates from FRED
  const rates = await fetchLatestRates();
  if (!rates) {
    return NextResponse.json({ error: 'Failed to fetch rates from FRED' }, { status: 502 });
  }

  // 2. Check if we already have this rate date
  const { data: existing } = await supabase
    .from('mortgage_rates')
    .select('id, rate_30yr_fixed')
    .eq('rate_date', rates.date)
    .maybeSingle();

  let rateRecord: { id: string; rate_30yr_fixed: number; rate_fha: number | null } | null = null;

  if (existing) {
    // Rate already exists for this date - no change
    rateRecord = existing as unknown as typeof rateRecord;
  } else {
    // Insert new rate
    const { data: inserted, error: insertError } = await supabase
      .from('mortgage_rates')
      .insert({
        rate_date: rates.date,
        rate_30yr_fixed: rates.rate30yr,
        rate_fha: rates.rateFHA,
        source: 'FRED',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert mortgage rate:', insertError);
      return NextResponse.json({ error: 'Failed to store rate' }, { status: 500 });
    }

    rateRecord = inserted as typeof rateRecord;
  }

  // 3. Check for matching rate alerts and create notifications
  let notifiedCount = 0;

  const { data: alerts } = await supabase
    .from('rate_alerts')
    .select('*')
    .eq('is_active', true);

  if (alerts && alerts.length > 0) {
    const currentRate = rates.rate30yr;
    const notifications = [];

    for (const alert of alerts) {
      let triggered = false;
      let rateToCheck = currentRate;

      // Use the appropriate rate for the loan type
      if (alert.loan_type === 'FHA') {
        rateToCheck = rates.rateFHA;
      }
      // VA rates similar to FHA in practice; Conventional uses 30yr fixed
      // Future: could add separate VA rates from FRED

      if (alert.alert_when === 'any_change') {
        // Only trigger if this is a new rate entry (not existing)
        triggered = !existing;
      } else if (alert.alert_when === 'drops_below' && alert.threshold_rate != null) {
        triggered = rateToCheck < parseFloat(alert.threshold_rate);
      } else if (alert.alert_when === 'rises_above' && alert.threshold_rate != null) {
        triggered = rateToCheck > parseFloat(alert.threshold_rate);
      }

      if (triggered) {
        const conditionLabel =
          alert.alert_when === 'any_change'
            ? 'updated'
            : alert.alert_when === 'drops_below'
            ? `dropped below ${alert.threshold_rate}%`
            : `rose above ${alert.threshold_rate}%`;

        notifications.push({
          user_id: alert.user_id,
          type: 'rate_alert',
          title: `Mortgage Rate Alert: ${alert.loan_type}`,
          body: `The ${alert.loan_type} mortgage rate has ${conditionLabel}. Current rate: ${rateToCheck.toFixed(2)}% as of ${rates.date}.`,
          metadata: {
            rate: rateToCheck,
            rate_date: rates.date,
            loan_type: alert.loan_type,
            alert_when: alert.alert_when,
            threshold_rate: alert.threshold_rate,
          },
        });
        notifiedCount++;
      }
    }

    if (notifications.length > 0) {
      const { error: notifError } = await supabase.from('notifications').insert(notifications);
      if (notifError) {
        console.error('Failed to create notifications:', notifError);
      }
    }
  }

  // CONFLUENT HOOK: In the full integration, publish the rate event here:
  // await confluentProducer.produce('mortgage-rates', {
  //   key: rates.date,
  //   value: { rate30yr: rates.rate30yr, rateFHA: rates.rateFHA, date: rates.date },
  // });

  return NextResponse.json({
    success: true,
    rate: {
      date: rates.date,
      rate30yr: rates.rate30yr,
      rateFHA: rates.rateFHA,
    },
    notified: notifiedCount,
    newEntry: !existing,
  });
}
