'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Home,
  DollarSign,
  Clock,
  BarChart2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { FLINK_QUERIES } from '@/lib/flink-queries';

// ─── Types ─────────────────────────────────────────────────────────────────

interface AnomalyNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  created_at: string;
  metadata: {
    anomaly_type?: string;
    current_rate?: number;
    rolling_avg?: number;
    is_test?: boolean;
  } | null;
}

interface MarketDataRow {
  id: string;
  data_date: string;
  metro: string;
  metric_name: string;
  metric_value: number;
  metric_unit: string | null;
  source: string;
}

interface MarketDataResponse {
  latest: MarketDataRow[];
  history: MarketDataRow[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

function fmtPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function pctChange(current: number, previous: number): number {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function monthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

// ─── Market Conditions ──────────────────────────────────────────────────────

function MarketBadge({ supply }: { supply: number | null }) {
  if (supply === null) return null;
  if (supply < 3)
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 text-sm px-3 py-1">
        Seller&apos;s Market 🔥
      </Badge>
    );
  if (supply <= 6)
    return (
      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-sm px-3 py-1">
        Balanced Market ⚖️
      </Badge>
    );
  return (
    <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-sm px-3 py-1">
      Buyer&apos;s Market 📉
    </Badge>
  );
}

// ─── Affordability Calculator ───────────────────────────────────────────────

function AffordabilityCalc({
  medianPrice,
  rate = 6.75,
}: {
  medianPrice: number | null;
  rate?: number;
}) {
  if (!medianPrice) return null;

  const downPayment = medianPrice * 0.2;
  const loanAmount = medianPrice - downPayment;
  const monthlyRate = rate / 100 / 12;
  const n = 30 * 12;
  const monthlyPayment =
    loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);

  // Add estimates for taxes + insurance (~1.2% / 12 of home value)
  const taxInsurance = (medianPrice * 0.012) / 12;
  const totalMonthly = monthlyPayment + taxInsurance;

  const income28 = (totalMonthly / 0.28) * 12;
  const income36 = (totalMonthly / 0.36) * 12;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-600" />
          Affordability Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          At median home price of <span className="font-semibold text-foreground">{fmtUSD(medianPrice)}</span>{' '}
          with <span className="font-semibold text-foreground">20% down</span> at current{' '}
          <span className="font-semibold text-foreground">{rate}% rate</span>:
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Est. Monthly Payment</p>
            <p className="font-bold text-lg">{fmtUSD(totalMonthly)}</p>
            <p className="text-xs text-muted-foreground">P&amp;I + est. taxes &amp; insurance</p>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Down Payment (20%)</p>
            <p className="font-bold text-lg">{fmtUSD(downPayment)}</p>
            <p className="text-xs text-muted-foreground">+ closing costs ~2-3%</p>
          </div>
        </div>
        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Required Annual Income
          </p>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">At 28% DTI (conservative)</span>
            <span className="font-semibold">{fmtUSD(income28)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">At 36% DTI (max qualifying)</span>
            <span className="font-semibold">{fmtUSD(income36)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MarketPage() {
  const [data, setData] = useState<MarketDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyNotification[]>([]);
  const [flinkExpanded, setFlinkExpanded] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/market-data');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as MarketDataResponse;
      setData(json);
      setLastUpdated(new Date().toLocaleString());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const fetchAnomalies = async () => {
    try {
      const res = await fetch('/api/notifications?type=anomaly&limit=5');
      if (!res.ok) return;
      const json = await res.json() as { notifications?: AnomalyNotification[] };
      setAnomalies(json.notifications ?? []);
    } catch {
      // Non-fatal
    }
  };

  useEffect(() => {
    fetchData();
    fetchAnomalies();
  }, []);

  const metrics = useMemo(() => {
    if (!data?.latest) return {};
    return Object.fromEntries(data.latest.map((r) => [r.metric_name, r]));
  }, [data]);

  const chartData = useMemo(() => {
    if (!data?.history) return [];
    return [...data.history]
      .sort((a, b) => a.data_date.localeCompare(b.data_date))
      .map((r) => ({
        month: monthLabel(r.data_date),
        value: Math.round(r.metric_value / 1000), // in $k
      }));
  }, [data]);

  const medianHomeValue = metrics['median_home_value']?.metric_value ?? null;
  const medianListPrice = metrics['median_list_price']?.metric_value ?? null;
  const daysOnMarket = metrics['days_on_market']?.metric_value ?? null;
  const monthlySupply = metrics['monthly_supply']?.metric_value ?? null;

  // % change vs 6 months ago (rough: last vs oldest in history if ≥ 6 points)
  const homePctChange = useMemo(() => {
    if (!data?.history || data.history.length < 6) return null;
    const sorted = [...data.history].sort((a, b) => a.data_date.localeCompare(b.data_date));
    const oldest = sorted[sorted.length - 6]?.metric_value;
    const newest = sorted[sorted.length - 1]?.metric_value;
    if (!oldest || !newest) return null;
    return pctChange(newest, oldest);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Seattle Housing Market</h1>
          <p className="text-muted-foreground text-sm">Seattle-Tacoma-Bellevue MSA</p>
        </div>
        <div className="flex items-center gap-3">
          <MarketBadge supply={monthlySupply} />
          <button
            onClick={fetchData}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Refresh data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          Failed to load market data: {error}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Median Home Value */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Median Home Value</p>
                <p className="text-2xl font-bold mt-1">
                  {loading ? '—' : medianHomeValue ? fmtUSD(medianHomeValue) : 'N/A'}
                </p>
                {homePctChange !== null && (
                  <p
                    className={`text-xs mt-1 flex items-center gap-1 ${
                      homePctChange >= 0 ? 'text-green-600' : 'text-red-500'
                    }`}
                  >
                    {homePctChange >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {fmtPct(homePctChange)} vs 6mo ago
                  </p>
                )}
              </div>
              <Home className="h-8 w-8 text-blue-100" />
            </div>
          </CardContent>
        </Card>

        {/* Median List Price */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Median List Price</p>
                <p className="text-2xl font-bold mt-1">
                  {loading ? '—' : medianListPrice ? fmtUSD(medianListPrice) : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Active listings</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-100" />
            </div>
          </CardContent>
        </Card>

        {/* Days on Market */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Avg Days on Market</p>
                <p className="text-2xl font-bold mt-1">
                  {loading ? '—' : daysOnMarket !== null ? `${Math.round(daysOnMarket)}` : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">days to go pending</p>
              </div>
              <Clock className="h-8 w-8 text-orange-100" />
            </div>
          </CardContent>
        </Card>

        {/* Monthly Supply */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Monthly Supply</p>
                <p className="text-2xl font-bold mt-1">
                  {loading ? '—' : monthlySupply !== null ? `${monthlySupply}mo` : 'N/A'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {monthlySupply !== null
                    ? monthlySupply < 3
                      ? 'Seller favored'
                      : monthlySupply <= 6
                      ? 'Balanced'
                      : 'Buyer favored'
                    : ''}
                </p>
              </div>
              <BarChart2 className="h-8 w-8 text-purple-100" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Home Value Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            Home Value Trend (24 months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
              Loading chart data…
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
              No historical data yet. Check back after the first weekly cron run.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}k`}
                  width={52}
                />
                <RechartsTooltip
                  formatter={(value) => [`$${Number(value)}k`, 'Median Home Value']}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Affordability Calculator */}
      <AffordabilityCalc medianPrice={medianHomeValue} />

      {/* Anomaly Detection Section */}
      <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <span className="text-lg">⚡</span>
            <span>Anomaly Detection</span>
            <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs px-2 py-0 dark:bg-purple-900 dark:text-purple-200">
              Powered by Confluent Flink
            </Badge>
            <Badge className="bg-purple-50 text-purple-600 border-purple-200 text-xs px-2 py-0 dark:bg-purple-950 dark:text-purple-300">
              Kafka Streaming
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Confluent Flink monitors mortgage rates and market data in real-time, flagging
            historically low rates and motivated-seller signals.
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Recent Anomalies */}
          {anomalies.length === 0 ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
              No anomalies detected — rates and prices appear normal
            </div>
          ) : (
            <div className="space-y-2">
              {anomalies.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 p-3 dark:bg-yellow-950/30 dark:border-yellow-800"
                >
                  <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-200">
                      {a.title}
                      {a.metadata?.is_test && (
                        <span className="ml-1 text-yellow-500">(test)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* "How it works" collapsible */}
          <div className="border-t pt-3">
            <button
              onClick={() => setFlinkExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-300 hover:text-purple-900 transition-colors"
            >
              {flinkExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              How it works — Flink SQL
            </button>

            {flinkExpanded && (
              <div className="mt-3 space-y-4">
                {FLINK_QUERIES.map((q) => (
                  <div key={q.id}>
                    <p className="text-xs font-semibold text-foreground mb-0.5">{q.title}</p>
                    <p className="text-xs text-muted-foreground mb-1">{q.description}</p>
                    <pre className="text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                      {q.sql}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          {lastUpdated && (
            <p className="text-xs text-purple-600 dark:text-purple-400">
              Last event: {lastUpdated}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Data freshness note */}
      <div className="text-xs text-muted-foreground text-center pb-2">
        Data sourced from Zillow Research &amp; Federal Reserve FRED. Updated weekly.
        {lastUpdated && ` · Last fetched ${lastUpdated}`}
      </div>
    </div>
  );
}
