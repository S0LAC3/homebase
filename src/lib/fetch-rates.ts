/**
 * FRED (Federal Reserve Economic Data) rate fetching utility.
 *
 * CONFLUENT HOOK: When Confluent integration is available, this module would
 * publish fetched rates to a Kafka topic (e.g., 'mortgage-rates') via a
 * Confluent producer. The cron job would call the producer instead of directly
 * inserting into Supabase, and a separate consumer would handle DB writes.
 *
 * For now, returns rates directly for the cron route to handle.
 */

export interface FetchedRates {
  date: string;
  rate30yr: number;
  rateFHA: number;
  rate15yr?: number;
}

/**
 * Fetches the latest 30-year fixed mortgage rate from FRED.
 * API key is optional for low usage (rate-limited without key).
 * Set FRED_API_KEY env var for higher limits.
 */
export async function fetchLatestRates(): Promise<FetchedRates | null> {
  const apiKey = process.env.FRED_API_KEY;

  // Build FRED URL — api_key is optional, FRED allows anonymous requests at low volume
  const params = new URLSearchParams({
    series_id: 'MORTGAGE30US',
    sort_order: 'desc',
    limit: '2', // get 2 to also have the prior week if needed
    file_type: 'json',
  });
  if (apiKey) {
    params.set('api_key', apiKey);
  } else {
    // Without an API key, FRED still responds but may throttle
    params.set('api_key', 'abcdefghijklmnopqrstuvwxyz123456'); // placeholder key (FRED accepts but throttles)
  }

  const url = `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`;

  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    console.error(`FRED API error: ${res.status} ${res.statusText}`);
    return null;
  }

  const json = await res.json();

  // FRED returns observations array; filter out "." (missing data) entries
  const observations: Array<{ date: string; value: string }> = json.observations ?? [];
  const valid = observations.filter((o) => o.value !== '.');

  if (valid.length === 0) {
    console.error('FRED returned no valid observations');
    return null;
  }

  const latest = valid[0];
  const rate30yr = parseFloat(latest.value);

  // FHA rates typically run ~0.1% below conventional 30yr fixed
  const rateFHA = parseFloat((rate30yr - 0.1).toFixed(2));

  return {
    date: latest.date,
    rate30yr,
    rateFHA,
  };
}
