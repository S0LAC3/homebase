/**
 * Vercel Cron Job: Fetch Seattle housing market data from FRED and Zillow.
 * Schedule: every Monday at 10am (see vercel.json)
 *
 * Data sources:
 *   1. FRED - Federal Reserve Economic Data (free, no key required for basic use)
 *   2. Zillow Research - Public CSV downloads (free, no key required)
 *
 * TODO: Confluent integration
 * When Confluent keys are available, publish market data events to 'market-data-seattle' topic:
 * producer.produce('market-data-seattle', null, JSON.stringify(marketDataEvent))
 * Consumers can then fan out to real-time notifications, analytics, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_PARAMS = 'sort_order=desc&limit=4&file_type=json';

async function fetchFredSeries(seriesId: string): Promise<{ date: string; value: string }[]> {
  const url = `${FRED_BASE}?series_id=${seriesId}&${FRED_PARAMS}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json() as { observations?: { date: string; value: string }[] };
  return (json.observations ?? []).filter((o) => o.value !== '.' && o.value !== 'NA');
}

async function fetchZillowHVI(): Promise<{ date: string; value: number } | null> {
  const url =
    'https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv';

  const res = await fetch(url);
  if (!res.ok) return null;

  const text = await res.text();
  const lines = text.split('\n');
  if (lines.length < 2) return null;

  const header = lines[0].split(',');
  // Find Seattle row
  const seattleRow = lines.find(
    (line) =>
      line.includes('Seattle') &&
      (line.includes('Seattle-Tacoma') || line.includes('Seattle, WA'))
  );
  if (!seattleRow) return null;

  const cols = seattleRow.split(',');

  // Date columns start at index 5 (after RegionID, SizeRank, RegionName, RegionType, StateName)
  // Get the last non-empty column
  let lastIdx = cols.length - 1;
  while (lastIdx >= 5 && (!cols[lastIdx] || cols[lastIdx].trim() === '')) {
    lastIdx--;
  }
  if (lastIdx < 5) return null;

  const value = parseFloat(cols[lastIdx]);
  const date = header[lastIdx]?.trim() ?? new Date().toISOString().split('T')[0];

  if (isNaN(value)) return null;
  return { date, value };
}

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
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
  const upserted: string[] = [];
  const errors: string[] = [];

  // 1. Zillow Home Value Index — Seattle MSA median home value
  try {
    const hvi = await fetchZillowHVI();
    if (hvi) {
      const { error } = await supabase.from('market_data').upsert(
        {
          data_date: hvi.date,
          metro: 'Seattle-Tacoma-Bellevue',
          metric_name: 'median_home_value',
          metric_value: Math.round(hvi.value),
          metric_unit: 'USD',
          source: 'Zillow Research',
        },
        { onConflict: 'data_date,metro,metric_name' }
      );
      if (error) errors.push(`Zillow HVI: ${error.message}`);
      else upserted.push('median_home_value');
    }
  } catch (e) {
    errors.push(`Zillow HVI fetch error: ${String(e)}`);
  }

  // 2. FRED MEDLISPRI47900 — Seattle MSA median list price
  try {
    const obs = await fetchFredSeries('MEDLISPRI47900');
    if (obs.length > 0) {
      const o = obs[0];
      const { error } = await supabase.from('market_data').upsert(
        {
          data_date: o.date,
          metro: 'Seattle-Tacoma-Bellevue',
          metric_name: 'median_list_price',
          metric_value: parseFloat(o.value) * 1000, // FRED stores in $thousands
          metric_unit: 'USD',
          source: 'FRED / Realtor.com',
        },
        { onConflict: 'data_date,metro,metric_name' }
      );
      if (error) errors.push(`median_list_price: ${error.message}`);
      else upserted.push('median_list_price');
    }
  } catch (e) {
    errors.push(`FRED median list price error: ${String(e)}`);
  }

  // 3. FRED MEDDAYONMARNM — median days on market (national proxy)
  try {
    const obs = await fetchFredSeries('MEDDAYONMARNM');
    if (obs.length > 0) {
      const o = obs[0];
      const { error } = await supabase.from('market_data').upsert(
        {
          data_date: o.date,
          metro: 'Seattle-Tacoma-Bellevue',
          metric_name: 'days_on_market',
          metric_value: parseFloat(o.value),
          metric_unit: 'days',
          source: 'FRED / Realtor.com (national proxy)',
        },
        { onConflict: 'data_date,metro,metric_name' }
      );
      if (error) errors.push(`days_on_market: ${error.message}`);
      else upserted.push('days_on_market');
    }
  } catch (e) {
    errors.push(`FRED days on market error: ${String(e)}`);
  }

  // 4. FRED ACTLISCOUNM — active listing count (used to estimate supply)
  try {
    const obs = await fetchFredSeries('ACTLISCOUNM');
    if (obs.length > 0) {
      const o = obs[0];
      // Monthly supply = active listings / (sales pace); approximate with listing count / 300k units
      // This is a national proxy; real supply data would require MSA-level source
      const monthlySupply = parseFloat(o.value) / 300000;
      const { error } = await supabase.from('market_data').upsert(
        {
          data_date: o.date,
          metro: 'Seattle-Tacoma-Bellevue',
          metric_name: 'monthly_supply',
          metric_value: Math.round(monthlySupply * 10) / 10,
          metric_unit: 'months',
          source: 'FRED (national proxy)',
        },
        { onConflict: 'data_date,metro,metric_name' }
      );
      if (error) errors.push(`monthly_supply: ${error.message}`);
      else upserted.push('monthly_supply');
    }
  } catch (e) {
    errors.push(`FRED active listings error: ${String(e)}`);
  }

  return NextResponse.json({
    success: errors.length === 0,
    upserted,
    errors,
  });
}
