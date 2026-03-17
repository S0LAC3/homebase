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
  // Buy cost breakdown at year N
  buyPandI: number;
  buyPropertyTax: number;
  buyInsurance: number;
  buyHoa: number;
  buyMaintenance: number;
  buyMonthlyCost: number;
  // Rent cost at year N
  rentMonthlyCost: number;
  // Post-payoff monthly savings vs rent
  postPayoffSavings: number | null;
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

/**
 * Monthly P&I payment on a loan.
 * principal = loan amount (NOT home price)
 */
function monthlyPandIPayment(principal: number, annualRate: number, termYears: number): number {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/**
 * Remaining loan balance after monthsElapsed payments.
 * principal = original loan amount (NOT home price)
 */
function remainingLoanBalance(
  principal: number,
  annualRate: number,
  termYears: number,
  monthsElapsed: number,
): number {
  if (monthsElapsed >= termYears * 12) return 0;
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return Math.max(0, principal - (principal / n) * monthsElapsed);
  const pmt = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const balance = principal * Math.pow(1 + r, monthsElapsed) - pmt * (Math.pow(1 + r, monthsElapsed) - 1) / r;
  return Math.max(0, balance);
}

/**
 * Full month-by-month simulation.
 * Returns buyNetWorth, rentNetWorth, and per-year cost breakdowns.
 */
function calculateForYear(inputs: Inputs, years: number): YearResult {
  const {
    homePrice, downPaymentPct, mortgageRate, loanTermYears,
    appreciationPct, maintenancePct, monthlyHoa, monthlyInsurance,
    propertyTaxPct, buyingClosingCostsPct, sellingClosingCostsPct,
    monthlyRent, rentIncreasePct, monthlyRentersInsurance,
    netWorth, investmentRoi,
  } = inputs;

  // ── Derived constants ──────────────────────────────────────────────────────
  const downPayment = homePrice * (downPaymentPct / 100);
  const loanAmount = homePrice - downPayment;           // P&I is on THIS, not homePrice
  const buyingClosingCosts = homePrice * (buyingClosingCostsPct / 100);
  const pandI = monthlyPandIPayment(loanAmount, mortgageRate, loanTermYears);

  const months = years * 12;
  const payoffMonth = loanTermYears * 12;               // month when loan is fully paid
  const monthlyRoi = investmentRoi / 100 / 12;
  const annualRoi = investmentRoi / 100;

  // ── BUY SCENARIO ──────────────────────────────────────────────────────────
  //
  // Initial cash outlay: down payment + closing costs.
  // Remaining investable = netWorth - initial outlay (floor 0).
  // If outlay > netWorth, the buyer is cash-constrained but we still model it.

  const initialBuyOutlay = downPayment + buyingClosingCosts;
  const initialInvestableAfterBuy = Math.max(0, netWorth - initialBuyOutlay);

  // Base investable assets grow at ROI for the full period
  const investableGrown = initialInvestableAfterBuy * Math.pow(1 + annualRoi, years);

  // Home value at year N
  const homeValue = homePrice * Math.pow(1 + appreciationPct / 100, years);

  // Remaining mortgage balance (0 after payoff)
  const remainingMortgage = remainingLoanBalance(loanAmount, mortgageRate, loanTermYears, months);

  // Net home equity after selling costs
  const sellingCosts = homeValue * (sellingClosingCostsPct / 100);
  const homeEquityNet = homeValue - remainingMortgage - sellingCosts;

  // Month-by-month cashflow delta compounded forward.
  // Each month: delta = rentMonthly - buyMonthly
  //   positive delta → buying is cheaper → buyer invests the difference
  //   negative delta → renting is cheaper → buyer is spending MORE than renter
  //     (this is money the buyer does NOT invest — it's a cost drag)
  let buyCashflowPortfolio = 0;
  for (let m = 0; m < months; m++) {
    const yr = m / 12;
    const homeValAtM = homePrice * Math.pow(1 + appreciationPct / 100, yr);

    // P&I drops to 0 after payoff
    const pAndIThisMonth = m < payoffMonth ? pandI : 0;

    const buyMonthly =
      pAndIThisMonth +
      monthlyHoa +
      monthlyInsurance +
      homeValAtM * (propertyTaxPct / 100) / 12 +
      homeValAtM * (maintenancePct / 100) / 12;

    const rentMonthly =
      monthlyRent * Math.pow(1 + rentIncreasePct / 100, yr) +
      monthlyRentersInsurance;

    // positive = buying cheaper → buyer pockets the savings
    const delta = rentMonthly - buyMonthly;
    const monthsLeft = months - 1 - m;
    buyCashflowPortfolio += delta * Math.pow(1 + monthlyRoi, monthsLeft);
  }

  const buyNetWorth = investableGrown + homeEquityNet + buyCashflowPortfolio;

  // ── RENT SCENARIO ─────────────────────────────────────────────────────────
  //
  // Renter keeps the full netWorth and invests it.
  // Plus, each month the renter saves whatever the buyer spends above rent.

  const rentNetWorthGrown = netWorth * Math.pow(1 + annualRoi, years);

  let rentCashflowPortfolio = 0;
  for (let m = 0; m < months; m++) {
    const yr = m / 12;
    const homeValAtM = homePrice * Math.pow(1 + appreciationPct / 100, yr);

    const pAndIThisMonth = m < payoffMonth ? pandI : 0;

    const buyMonthly =
      pAndIThisMonth +
      monthlyHoa +
      monthlyInsurance +
      homeValAtM * (propertyTaxPct / 100) / 12 +
      homeValAtM * (maintenancePct / 100) / 12;

    const rentMonthly =
      monthlyRent * Math.pow(1 + rentIncreasePct / 100, yr) +
      monthlyRentersInsurance;

    // positive = renting cheaper → renter invests the difference
    const delta = buyMonthly - rentMonthly;
    const monthsLeft = months - 1 - m;
    rentCashflowPortfolio += delta * Math.pow(1 + monthlyRoi, monthsLeft);
  }

  const rentNetWorth = rentNetWorthGrown + rentCashflowPortfolio;

  // ── Monthly cost breakdown at year N (for display) ─────────────────────────
  const homeValAtYear = homePrice * Math.pow(1 + appreciationPct / 100, years);
  const isPaidOff = years >= loanTermYears;
  const buyPandI = isPaidOff ? 0 : pandI;
  const buyPropertyTax = homeValAtYear * (propertyTaxPct / 100) / 12;
  const buyMaintenance = homeValAtYear * (maintenancePct / 100) / 12;
  const buyHoa = monthlyHoa;
  const buyInsurance = monthlyInsurance;
  const buyMonthlyCost = buyPandI + buyPropertyTax + buyMaintenance + buyHoa + buyInsurance;

  const rentMonthlyCost =
    monthlyRent * Math.pow(1 + rentIncreasePct / 100, years) + monthlyRentersInsurance;

  // Post-payoff monthly savings: at exactly year loanTermYears, how much does
  // the buyer save vs renting? (only meaningful when years >= loanTermYears)
  let postPayoffSavings: number | null = null;
  if (years >= loanTermYears) {
    // Cost at the payoff year
    const homeValAtPayoff = homePrice * Math.pow(1 + appreciationPct / 100, loanTermYears);
    const buyAtPayoff =
      monthlyHoa +
      monthlyInsurance +
      homeValAtPayoff * (propertyTaxPct / 100) / 12 +
      homeValAtPayoff * (maintenancePct / 100) / 12;
    const rentAtPayoff =
      monthlyRent * Math.pow(1 + rentIncreasePct / 100, loanTermYears) + monthlyRentersInsurance;
    postPayoffSavings = rentAtPayoff - buyAtPayoff;
  }

  return {
    year: years,
    buyNetWorth,
    rentNetWorth,
    diff: buyNetWorth - rentNetWorth,
    buyPandI,
    buyPropertyTax,
    buyInsurance,
    buyHoa,
    buyMaintenance,
    buyMonthlyCost,
    rentMonthlyCost,
    postPayoffSavings,
  };
}

function computeBreakEven(inputs: Inputs): number | null {
  for (let y = 1; y <= 40; y++) {
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

function MonthlyCostTooltip({ active, payload, label, loanTermYears }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  loanTermYears: number;
}) {
  if (!active || !payload?.length) return null;
  const yr = Number(label);
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">Year {label}{yr > loanTermYears ? ' (post-payoff)' : ''}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmtFull(p.value)}/mo</p>
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

  // Year 0 net worth for chart baseline
  const year0NW = inputs.netWorth;

  // Line chart data: year 0..35 (show past payoff)
  const lineData = useMemo(() => {
    return Array.from({ length: 36 }, (_, y) => {
      if (y === 0) return { year: 0, Buy: year0NW, Rent: year0NW };
      const r = calculateForYear(inputs, y);
      return { year: y, Buy: Math.round(r.buyNetWorth), Rent: Math.round(r.rentNetWorth) };
    });
  }, [inputs, year0NW]);

  // Monthly cost line chart: year 1..35, showing the payoff drop
  const monthlyLineData = useMemo(() => {
    const maxYr = Math.max(35, inputs.loanTermYears + 5);
    return Array.from({ length: maxYr }, (_, i) => {
      const yr = i + 1;
      const homeVal = inputs.homePrice * Math.pow(1 + inputs.appreciationPct / 100, yr);
      const loanAmount = inputs.homePrice * (1 - inputs.downPaymentPct / 100);
      const pandI = monthlyPandIPayment(loanAmount, inputs.mortgageRate, inputs.loanTermYears);
      const isPaidOff = yr >= inputs.loanTermYears;

      const buyPandI = isPaidOff ? 0 : pandI;
      const buyPropTax = homeVal * (inputs.propertyTaxPct / 100) / 12;
      const buyMaint = homeVal * (inputs.maintenancePct / 100) / 12;
      const buyTotal = buyPandI + buyPropTax + inputs.monthlyInsurance + inputs.monthlyHoa + buyMaint;

      const rentTotal = inputs.monthlyRent * Math.pow(1 + inputs.rentIncreasePct / 100, yr) + inputs.monthlyRentersInsurance;

      return {
        year: yr,
        'Buy Monthly': Math.round(buyTotal),
        'Rent Monthly': Math.round(rentTotal),
      };
    });
  }, [inputs]);

  // Current (year 0) cost breakdown for buy
  const currentBuyBreakdown = useMemo(() => {
    const loanAmount = inputs.homePrice * (1 - inputs.downPaymentPct / 100);
    const pandI = monthlyPandIPayment(loanAmount, inputs.mortgageRate, inputs.loanTermYears);
    const propTax = inputs.homePrice * (inputs.propertyTaxPct / 100) / 12;
    const maintenance = inputs.homePrice * (inputs.maintenancePct / 100) / 12;
    const total = pandI + propTax + inputs.monthlyInsurance + inputs.monthlyHoa + maintenance;
    return { pandI, propTax, maintenance, total };
  }, [inputs]);

  // Post-payoff savings (at year = loanTermYears)
  const postPayoffResult = useMemo(() => {
    if (inputs.loanTermYears > 0) return calculateForYear(inputs, inputs.loanTermYears);
    return null;
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

          {/* Monthly cost breakdown card */}
          <div className="p-4 bg-muted/40 rounded-lg text-sm space-y-3">
            <p className="font-semibold">Current monthly costs (Year 1)</p>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Buy</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">P&amp;I (on {fmtFull(inputs.homePrice * (1 - inputs.downPaymentPct / 100))} loan)</span>
                <span className="font-medium">{fmtFull(currentBuyBreakdown.pandI)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Property tax ({inputs.propertyTaxPct}%/yr)</span>
                <span className="font-medium">{fmtFull(currentBuyBreakdown.propTax)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Home insurance</span>
                <span className="font-medium">{fmtFull(inputs.monthlyInsurance)}</span>
              </div>
              {inputs.monthlyHoa > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HOA</span>
                  <span className="font-medium">{fmtFull(inputs.monthlyHoa)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Maintenance ({inputs.maintenancePct}%/yr)</span>
                <span className="font-medium">{fmtFull(currentBuyBreakdown.maintenance)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="font-semibold">Total buy</span>
                <span className="font-semibold">{fmtFull(currentBuyBreakdown.total)}</span>
              </div>
            </div>
            <div className="space-y-1 pt-1 border-t">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Rent</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rent</span>
                <span className="font-medium">{fmtFull(inputs.monthlyRent)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Renter&apos;s insurance</span>
                <span className="font-medium">{fmtFull(inputs.monthlyRentersInsurance)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="font-semibold">Total rent</span>
                <span className="font-semibold">{fmtFull(inputs.monthlyRent + inputs.monthlyRentersInsurance)}</span>
              </div>
            </div>
          </div>

          {/* Post-payoff savings */}
          {postPayoffResult?.postPayoffSavings != null && (
            <div className={`p-4 rounded-lg text-sm border ${postPayoffResult.postPayoffSavings > 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className="font-semibold mb-1">After year {inputs.loanTermYears} (mortgage paid off)</p>
              <p className="text-muted-foreground text-xs mb-2">
                P&amp;I drops to $0. You only pay taxes, insurance, HOA, and maintenance.
              </p>
              <div className="flex justify-between font-medium">
                <span>Monthly savings vs renting</span>
                <span className={postPayoffResult.postPayoffSavings > 0 ? 'text-green-700' : 'text-amber-700'}>
                  {postPayoffResult.postPayoffSavings > 0 ? '+' : ''}{fmtFull(postPayoffResult.postPayoffSavings)}/mo
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                These savings get invested and compound at your {inputs.investmentRoi}% ROI.
              </p>
            </div>
          )}
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
                        Buying does not break even within 40 years
                      </Badge>
                      <p className="text-sm text-muted-foreground mt-1">
                        Renting + investing leads at every horizon with these inputs.
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
                      <th className="text-right py-2 font-medium text-muted-foreground">Buy Monthly</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Rent Monthly</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Winner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {horizonResults.map((r) => (
                      <tr key={r.year} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 font-medium">
                          Year {r.year}
                          {r.year >= inputs.loanTermYears && (
                            <span className="ml-1 text-xs text-green-600 font-normal">(paid off)</span>
                          )}
                        </td>
                        <td className="py-2 text-right text-blue-700 font-medium">{fmt(r.buyNetWorth)}</td>
                        <td className="py-2 text-right text-purple-700 font-medium">{fmt(r.rentNetWorth)}</td>
                        <td className={`py-2 text-right font-medium ${r.diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {r.diff >= 0 ? '+' : ''}{fmt(r.diff)}
                        </td>
                        <td className="py-2 text-right text-blue-600">{fmtFull(r.buyMonthlyCost)}</td>
                        <td className="py-2 text-right text-purple-600">{fmtFull(r.rentMonthlyCost)}</td>
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
                <Home className="h-4 w-4" /> Net Worth Over 35 Years
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
                  {inputs.loanTermYears <= 35 && (
                    <ReferenceLine
                      x={inputs.loanTermYears}
                      stroke="#f97316"
                      strokeDasharray="4 4"
                      label={{ value: `Payoff yr ${inputs.loanTermYears}`, fill: '#f97316', fontSize: 11 }}
                    />
                  )}
                  <Line type="monotone" dataKey="Buy" stroke="#3b82f6" strokeWidth={2} dot={false} name="Buy Net Worth" />
                  <Line type="monotone" dataKey="Rent" stroke="#a855f7" strokeWidth={2} dot={false} name="Rent Net Worth" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Monthly Cost Line Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly Cost Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthlyLineData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" label={{ value: 'Year', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} width={60} />
                  <Tooltip content={<MonthlyCostTooltip loanTermYears={inputs.loanTermYears} />} />
                  <Legend />
                  {inputs.loanTermYears <= 35 && (
                    <ReferenceLine
                      x={inputs.loanTermYears}
                      stroke="#f97316"
                      strokeDasharray="4 4"
                      label={{ value: `P&I drops to $0`, fill: '#f97316', fontSize: 11 }}
                    />
                  )}
                  <Line type="monotone" dataKey="Buy Monthly" stroke="#3b82f6" strokeWidth={2} dot={false} name="Buy Monthly" />
                  <Line type="monotone" dataKey="Rent Monthly" stroke="#a855f7" strokeWidth={2} dot={false} name="Rent Monthly" />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">
                Buy includes P&amp;I + property tax + insurance + HOA + maintenance (property tax and maintenance grow with appreciation).
                After year {inputs.loanTermYears}, P&amp;I drops to $0 — only taxes, insurance, HOA, and maintenance remain.
                Rent grows at {inputs.rentIncreasePct}%/yr.
              </p>
            </CardContent>
          </Card>

          {/* Year 30 buy cost breakdown */}
          {horizonResults.find((r) => r.year === 30) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Buy Cost Breakdown at Year 30</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const r30 = horizonResults.find((r) => r.year === 30)!;
                  const rows = [
                    { label: 'P&I', value: r30.buyPandI, note: r30.buyPandI === 0 ? '(loan paid off)' : '' },
                    { label: `Property tax (${inputs.propertyTaxPct}%/yr on appreciated value)`, value: r30.buyPropertyTax },
                    { label: 'Home insurance', value: r30.buyInsurance },
                    { label: 'HOA', value: r30.buyHoa },
                    { label: `Maintenance (${inputs.maintenancePct}%/yr on appreciated value)`, value: r30.buyMaintenance },
                  ];
                  return (
                    <div className="space-y-2 text-sm">
                      {rows.map((row) => (
                        <div key={row.label} className="flex justify-between">
                          <span className="text-muted-foreground">{row.label}{row.note ? ` ${row.note}` : ''}</span>
                          <span className={`font-medium ${row.value === 0 ? 'text-muted-foreground line-through' : ''}`}>
                            {fmtFull(row.value)}/mo
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between border-t pt-2 font-semibold">
                        <span>Total buy/mo (yr 30)</span>
                        <span className="text-blue-700">{fmtFull(r30.buyMonthlyCost)}/mo</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Total rent/mo (yr 30)</span>
                        <span className="text-purple-700">{fmtFull(r30.rentMonthlyCost)}/mo</span>
                      </div>
                      {r30.postPayoffSavings != null && (
                        <div className={`flex justify-between font-semibold pt-1 border-t ${r30.postPayoffSavings > 0 ? 'text-green-700' : 'text-amber-700'}`}>
                          <span>Monthly advantage (buy vs rent)</span>
                          <span>{r30.postPayoffSavings > 0 ? '+' : ''}{fmtFull(r30.postPayoffSavings)}/mo</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
