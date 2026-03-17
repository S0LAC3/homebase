'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, ReferenceLine,
} from 'recharts';
import { TrendingUp, Home, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Inputs {
  // Purchase
  homePrice: number;
  downPaymentPct: number;
  mortgageRate: number;
  loanTermYears: number;
  appreciationPct: number;
  maintenancePct: number;
  monthlyHoa: number;
  monthlyInsurance: number;
  propertyTaxPct: number;
  buyingClosingCostsPct: number;
  sellingClosingCostsPct: number;
  // Rent
  monthlyRent: number;
  rentIncreasePct: number;
  monthlyRentersInsurance: number;
  // Financial
  netWorth: number;
  investmentRoi: number;
}

interface YearResult {
  year: number;
  buyNetWorth: number;
  rentNetWorth: number;
  diff: number;
  buyMonthlyCost: number;
  rentMonthlyCost: number;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtFull(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ─── Calculation engine ───────────────────────────────────────────────────────

function monthlyPayment(principal: number, annualRate: number, termYears: number): number {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function remainingBalance(principal: number, annualRate: number, termYears: number, monthsElapsed: number): number {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal - (principal / n) * monthsElapsed;
  const pmt = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return principal * Math.pow(1 + r, monthsElapsed) - pmt * (Math.pow(1 + r, monthsElapsed) - 1) / r;
}

// Grow a series of monthly cashflows at monthly ROI, return total portfolio value
function growMonthlyCashflows(monthlyAmounts: number[], annualRoi: number): number {
  const monthlyRoi = annualRoi / 100 / 12;
  let portfolio = 0;
  for (let i = 0; i < monthlyAmounts.length; i++) {
    const monthsRemaining = monthlyAmounts.length - 1 - i;
    portfolio += monthlyAmounts[i] * Math.pow(1 + monthlyRoi, monthsRemaining);
  }
  return portfolio;
}

function calculateForYear(inputs: Inputs, years: number): YearResult {
  const {
    homePrice, downPaymentPct, mortgageRate, loanTermYears,
    appreciationPct, maintenancePct, monthlyHoa, monthlyInsurance,
    propertyTaxPct, buyingClosingCostsPct, sellingClosingCostsPct,
    monthlyRent, rentIncreasePct, monthlyRentersInsurance,
    netWorth, investmentRoi,
  } = inputs;

  const downPayment = homePrice * (downPaymentPct / 100);
  const loanAmount = homePrice - downPayment;
  const buyingClosingCosts = homePrice * (buyingClosingCostsPct / 100);
  const monthlyPandI = monthlyPayment(loanAmount, mortgageRate, loanTermYears);

  const months = years * 12;
  const annualRoi = investmentRoi / 100;
  const monthlyRoi = annualRoi / 12;

  // ── BUY SCENARIO ──────────────────────────────────────────────────────────

  // Initial cash deployed: down payment + closing costs (reduces investable assets)
  const initialBuyOutlay = downPayment + buyingClosingCosts;
  // Remaining investable assets after buying
  const initialInvestableAfterBuy = Math.max(0, netWorth - initialBuyOutlay);

  // Grow remaining investable assets
  const investableGrown = initialInvestableAfterBuy * Math.pow(1 + annualRoi, years);

  // Home value at year N
  const homeValue = homePrice * Math.pow(1 + appreciationPct / 100, years);

  // Remaining mortgage balance
  const elapsedMonths = Math.min(months, loanTermYears * 12);
  const remainingMortgage = remainingBalance(loanAmount, mortgageRate, loanTermYears, elapsedMonths);

  // Home equity after selling costs
  const sellingCosts = homeValue * (sellingClosingCostsPct / 100);
  const homeEquityNet = homeValue - remainingMortgage - sellingCosts;

  // Monthly buy costs at start of period (property tax, maintenance grow with home value)
  const initialMonthlyPropertyTax = homePrice * (propertyTaxPct / 100) / 12;
  const initialMonthlyMaintenance = homePrice * (maintenancePct / 100) / 12;
  const buyMonthlyCostAtYear = (homePrice * Math.pow(1 + appreciationPct / 100, years) * (propertyTaxPct / 100 + maintenancePct / 100)) / 12 + monthlyPandI + monthlyHoa + monthlyInsurance;

  // Monthly cash flow delta vs renting (negative = buying costs more each month)
  // We track month-by-month for compounding accuracy
  let buyCashflowPortfolio = 0;
  for (let m = 0; m < months; m++) {
    const yr = m / 12;
    const homeValAtM = homePrice * Math.pow(1 + appreciationPct / 100, yr);
    const buyMonthly = monthlyPandI + monthlyHoa + monthlyInsurance
      + homeValAtM * (propertyTaxPct / 100) / 12
      + homeValAtM * (maintenancePct / 100) / 12;
    const rentMonthly = monthlyRent * Math.pow(1 + rentIncreasePct / 100, yr) + monthlyRentersInsurance;
    const delta = rentMonthly - buyMonthly; // positive = buying is cheaper, invest the savings
    const monthsLeft = months - 1 - m;
    buyCashflowPortfolio += delta * Math.pow(1 + monthlyRoi, monthsLeft);
  }

  const buyNetWorth = investableGrown + homeEquityNet + buyCashflowPortfolio;

  // ── RENT SCENARIO ─────────────────────────────────────────────────────────

  // Full net worth (including down payment) grows at ROI
  const rentNetWorthGrown = netWorth * Math.pow(1 + annualRoi, years);

  // Month-by-month: renter saves whatever difference vs buying
  let rentCashflowPortfolio = 0;
  for (let m = 0; m < months; m++) {
    const yr = m / 12;
    const homeValAtM = homePrice * Math.pow(1 + appreciationPct / 100, yr);
    const buyMonthly = monthlyPandI + monthlyHoa + monthlyInsurance
      + homeValAtM * (propertyTaxPct / 100) / 12
      + homeValAtM * (maintenancePct / 100) / 12;
    const rentMonthly = monthlyRent * Math.pow(1 + rentIncreasePct / 100, yr) + monthlyRentersInsurance;
    const delta = buyMonthly - rentMonthly; // positive = renting is cheaper, invest savings
    const monthsLeft = months - 1 - m;
    rentCashflowPortfolio += delta * Math.pow(1 + monthlyRoi, monthsLeft);
  }

  const rentNetWorth = rentNetWorthGrown + rentCashflowPortfolio;

  // Monthly costs at the given year (for display)
  const rentMonthlyCostAtYear = monthlyRent * Math.pow(1 + rentIncreasePct / 100, years) + monthlyRentersInsurance;

  return {
    year: years,
    buyNetWorth,
    rentNetWorth,
    diff: buyNetWorth - rentNetWorth,
    buyMonthlyCost: buyMonthlyCostAtYear,
    rentMonthlyCost: rentMonthlyCostAtYear,
  };
}

function computeBreakEven(inputs: Inputs): number | null {
  for (let y = 1; y <= 30; y++) {
    const r = calculateForYear(inputs, y);
    if (r.diff >= 0) return y;
  }
  return null;
}

// ─── Collapsible section component ────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 text-sm font-semibold transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

function Field({ label, value, onChange, step, prefix, suffix }: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; prefix?: string; suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-sm text-muted-foreground pointer-events-none">{prefix}</span>}
        <Input
          type="number"
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={prefix ? 'pl-6' : suffix ? 'pr-8' : ''}
        />
        {suffix && <span className="absolute right-3 text-sm text-muted-foreground pointer-events-none">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Custom tooltip for charts ─────────────────────────────────────────────────

function NetWorthTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">Year {label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmtFull(p.value)}</p>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const HORIZON_YEARS = [5, 7, 10, 15, 20, 30];

export default function RentVsBuyPage() {
  const [inputs, setInputs] = useState<Inputs>({
    homePrice: 750000,
    downPaymentPct: 3.5,
    mortgageRate: 6.75,
    loanTermYears: 30,
    appreciationPct: 4,
    maintenancePct: 1.5,
    monthlyHoa: 0,
    monthlyInsurance: 150,
    propertyTaxPct: 1,
    buyingClosingCostsPct: 3,
    sellingClosingCostsPct: 7,
    monthlyRent: 2800,
    rentIncreasePct: 4,
    monthlyRentersInsurance: 20,
    netWorth: 100000,
    investmentRoi: 7,
  });

  function set(key: keyof Inputs) {
    return (val: number) => setInputs((prev) => ({ ...prev, [key]: val }));
  }

  const horizonResults = useMemo(() => HORIZON_YEARS.map((y) => calculateForYear(inputs, y)), [inputs]);
  const breakEven = useMemo(() => computeBreakEven(inputs), [inputs]);

  // Line chart data: year 0..30
  const lineData = useMemo(() => {
    return Array.from({ length: 31 }, (_, y) => {
      if (y === 0) {
        return { year: 0, Buy: inputs.netWorth, Rent: inputs.netWorth };
      }
      const r = calculateForYear(inputs, y);
      return { year: y, Buy: Math.round(r.buyNetWorth), Rent: Math.round(r.rentNetWorth) };
    });
  }, [inputs]);

  // Bar chart data at 5yr intervals
  const barData = useMemo(() => [5, 10, 15, 20, 30].map((y) => {
    const r = calculateForYear(inputs, y);
    return {
      year: `Yr ${y}`,
      'Buy Monthly': Math.round(r.buyMonthlyCost),
      'Rent Monthly': Math.round(r.rentMonthlyCost),
    };
  }), [inputs]);

  const currentBuyMonthly = useMemo(() => {
    const downPayment = inputs.homePrice * (inputs.downPaymentPct / 100);
    const loanAmount = inputs.homePrice - downPayment;
    const pAndI = monthlyPayment(loanAmount, inputs.mortgageRate, inputs.loanTermYears);
    const propTax = inputs.homePrice * (inputs.propertyTaxPct / 100) / 12;
    const maintenance = inputs.homePrice * (inputs.maintenancePct / 100) / 12;
    return pAndI + inputs.monthlyHoa + inputs.monthlyInsurance + propTax + maintenance;
  }, [inputs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rent vs. Buy Forecaster</h1>
        <p className="text-muted-foreground">See which path builds more wealth over your time horizon.</p>
      </div>

      <div className="grid lg:grid-cols-[380px,1fr] gap-6 items-start">
        {/* ── LEFT: INPUT FORM ── */}
        <div className="space-y-3">
          <Section title="🏠 Purchase Scenario">
            <Field label="Home Price ($)" value={inputs.homePrice} onChange={set('homePrice')} step={5000} prefix="$" />
            <Field label="Down Payment (%)" value={inputs.downPaymentPct} onChange={set('downPaymentPct')} step={0.5} suffix="%" />
            <Field label="Mortgage Rate (%)" value={inputs.mortgageRate} onChange={set('mortgageRate')} step={0.125} suffix="%" />
            <Field label="Loan Term (years)" value={inputs.loanTermYears} onChange={set('loanTermYears')} />
            <Field label="Home Appreciation (%/yr)" value={inputs.appreciationPct} onChange={set('appreciationPct')} step={0.5} suffix="%" />
            <Field label="Maintenance (% of value/yr)" value={inputs.maintenancePct} onChange={set('maintenancePct')} step={0.25} suffix="%" />
            <Field label="Monthly HOA ($)" value={inputs.monthlyHoa} onChange={set('monthlyHoa')} prefix="$" />
            <Field label="Monthly Home Insurance ($)" value={inputs.monthlyInsurance} onChange={set('monthlyInsurance')} prefix="$" />
            <Field label="Property Tax (%/yr)" value={inputs.propertyTaxPct} onChange={set('propertyTaxPct')} step={0.1} suffix="%" />
            <Field label="Buying Closing Costs (%)" value={inputs.buyingClosingCostsPct} onChange={set('buyingClosingCostsPct')} step={0.5} suffix="%" />
            <Field label="Selling Closing Costs (%)" value={inputs.sellingClosingCostsPct} onChange={set('sellingClosingCostsPct')} step={0.5} suffix="%" />
          </Section>

          <Section title="🏢 Rent Scenario">
            <Field label="Monthly Rent ($)" value={inputs.monthlyRent} onChange={set('monthlyRent')} step={50} prefix="$" />
            <Field label="Annual Rent Increase (%)" value={inputs.rentIncreasePct} onChange={set('rentIncreasePct')} step={0.5} suffix="%" />
            <Field label="Monthly Renter's Insurance ($)" value={inputs.monthlyRentersInsurance} onChange={set('monthlyRentersInsurance')} prefix="$" />
          </Section>

          <Section title="📈 Financial Profile">
            <Field label="Current Net Worth / Investable Assets ($)" value={inputs.netWorth} onChange={set('netWorth')} step={10000} prefix="$" />
            <Field label="Expected Annual Investment ROI (%)" value={inputs.investmentRoi} onChange={set('investmentRoi')} step={0.5} suffix="%" />
            <p className="text-xs text-muted-foreground">Tax benefits are not modeled for simplicity.</p>
          </Section>

          <div className="p-3 bg-muted/40 rounded-lg text-sm space-y-1">
            <p className="font-medium">Current monthly costs:</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Buying (P&I + all costs)</span>
              <span className="font-medium">{fmtFull(currentBuyMonthly)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Renting (rent + insurance)</span>
              <span className="font-medium">{fmtFull(inputs.monthlyRent + inputs.monthlyRentersInsurance)}</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT: RESULTS ── */}
        <div className="space-y-5">
          {/* Break-even badge */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-blue-100">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  {breakEven !== null ? (
                    <>
                      <Badge className="text-base px-4 py-1 bg-green-600 hover:bg-green-600">
                        Buying breaks even at year {breakEven}
                      </Badge>
                      <p className="text-sm text-muted-foreground mt-1">
                        After year {breakEven}, buying consistently builds more wealth.
                      </p>
                    </>
                  ) : (
                    <>
                      <Badge variant="destructive" className="text-base px-4 py-1">
                        Buying does not break even within 30 years
                      </Badge>
                      <p className="text-sm text-muted-foreground mt-1">
                        Renting + investing leads at every 30-year horizon with these inputs.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Net Worth Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground">Year</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Buy</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Rent</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Difference</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Winner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {horizonResults.map((r) => (
                      <tr key={r.year} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 font-medium">Year {r.year}</td>
                        <td className="py-2 text-right text-blue-700 font-medium">{fmt(r.buyNetWorth)}</td>
                        <td className="py-2 text-right text-purple-700 font-medium">{fmt(r.rentNetWorth)}</td>
                        <td className={`py-2 text-right font-medium ${r.diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {r.diff >= 0 ? '+' : ''}{fmt(r.diff)}
                        </td>
                        <td className="py-2 text-right">
                          <Badge variant={r.diff >= 0 ? 'default' : 'secondary'} className={r.diff >= 0 ? 'bg-green-600 hover:bg-green-600' : ''}>
                            {r.diff >= 0 ? '🏠 Buy' : '🏢 Rent'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Net Worth Line Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Home className="h-4 w-4" /> Net Worth Over 30 Years
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={lineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" label={{ value: 'Year', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis tickFormatter={(v) => fmt(v)} width={70} />
                  <Tooltip content={<NetWorthTooltip />} />
                  <Legend />
                  {breakEven !== null && (
                    <ReferenceLine
                      x={breakEven}
                      stroke="#16a34a"
                      strokeDasharray="4 4"
                      label={{ value: `Break-even yr ${breakEven}`, fill: '#16a34a', fontSize: 11 }}
                    />
                  )}
                  <Line type="monotone" dataKey="Buy" stroke="#3b82f6" strokeWidth={2} dot={false} name="Buy Net Worth" />
                  <Line type="monotone" dataKey="Rent" stroke="#a855f7" strokeWidth={2} dot={false} name="Rent Net Worth" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Monthly Cost Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Cost at Each Horizon</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                  <Tooltip formatter={(value) => fmtFull(Number(value))} />
                  <Legend />
                  <Bar dataKey="Buy Monthly" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Rent Monthly" fill="#a855f7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                Buy monthly includes P&I, property tax, maintenance, insurance, and HOA. Rent monthly includes rent and renter&apos;s insurance, both growing at their respective annual rates.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
