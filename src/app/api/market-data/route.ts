import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get the latest value for each metric
  const { data, error } = await supabase
    .from('market_data')
    .select('*')
    .eq('metro', 'Seattle-Tacoma-Bellevue')
    .order('data_date', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by metric_name, keeping the most recent per metric
  const latestByMetric: Record<string, typeof data[0]> = {};
  const history: typeof data = [];

  for (const row of data ?? []) {
    if (!latestByMetric[row.metric_name]) {
      latestByMetric[row.metric_name] = row;
    }
    if (row.metric_name === 'median_home_value') {
      history.push(row);
    }
  }

  return NextResponse.json({
    latest: Object.values(latestByMetric),
    history: history.slice(0, 24), // Last 24 data points for trend chart
  });
}
