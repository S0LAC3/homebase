'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend, ReferenceLine,
  BarChart, Bar,
} from 'recharts';
import { Home, ChevronDown, ChevronUp, TrendingUp, DollarSign, AlertTriangle, Wallet } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Inputs {
  // Property
  homePrice: number;
  appreciationPct: number;
  buyingClosingCostsPct: number;
  sellingClosingCostsPct: number;
  // Mortgage
  mortgageRate: number;
  loanTermYears: number;
  extraMonthlyPrincipal: number;
  // Rent
  monthlyRent: number;
  rentIncreasePct: number;
  monthlyRentersInsurance: number;
  // Operating costs
  maintenancePct: number;
  monthlyHoa: number;
  monthlyInsurance: number;
  propertyTaxPct: number;
  // Financial
  totalAvailableCash: number;
  investmentRoi: number;
  // Income & Taxes
  annualSalary: number;
  taxRatePct: number;
  monthlyFixedRenting: number; // ALL renting expenses including rent
  monthlyFixedBuying: number;  // non-housing expenses when buying
  // Capital Gains Tax
  filingStatus: 'single' | 'married';
  capGainsRatePct: number;
}

interface MonthlySnapshot {
  month: number;
  fhaNW: number;
  convNW: number;
  rentNW: number;
  fhaMonthly: number;
  convMonthly: number;
  rentMonthly: number;
  fhaBalance: number;
  convBalance: number;
}

interface YearlyRow {
  year: number;
  rentNW: number;
  fhaNW: number;
  convNW: number;
  rentMonthly: number;
  fhaMonthly: number;
  convMonthly: number;
  best: 'rent' | 'fha' | 'conv';
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function fmtFull(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n);
}

function fmtMo(n: number): string {
  return `${fmtFull(n)}/mo`;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function pmt(principal: number, annualRate: number, termYears: number): number {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ─── Simulation Engine ────────────────────────────────────────────────────────

interface SimResult {
  monthly: MonthlySnapshot[];
  fhaPayoffMonth: number | null;
  convPayoffMonth: number | null;
}

function simulate(inputs: Inputs): SimResult {
  const {
    homePrice, appreciationPct, buyingClosingCostsPct, sellingClosingCostsPct,
    mortgageRate, loanTermYears, extraMonthlyPrincipal,
    monthlyRent, rentIncreasePct, monthlyRentersInsurance,
    maintenancePct, monthlyHoa, monthlyInsurance, propertyTaxPct,
    totalAvailableCash, investmentRoi,
    annualSalary, taxRatePct, monthlyFixedRenting, monthlyFixedBuying,
    filingStatus, capGainsRatePct,
  } = inputs;

  const exclusion = filingStatus === 'married' ? 500_000 : 250_000;
  const monthlyROI = investmentRoi / 100 / 12;
  const monthlyRate = mortgageRate / 100 / 12;
  const monthlyNetIncome = annualSalary / 12 * (1 - taxRatePct / 100);

  // Fixed monthly investment for rent scenario (constant — rent increases are in monthlyRent)
  const rentMonthlyAvailable = monthlyNetIncome - monthlyFixedRenting;

  // FHA setup
  const fhaDown = homePrice * 0.035;
  const fhaBaseLoan = homePrice - fhaDown;
  const fhaUpfrontMIP = fhaBaseLoan * 0.0175;
  const fhaLoan = fhaBaseLoan + fhaUpfrontMIP;
  const fhaPandI = pmt(fhaLoan, mortgageRate, loanTermYears);
  const fhaMonthlyMIP = fhaLoan * 0.0055 / 12;
  const fhaClosing = homePrice * buyingClosingCostsPct / 100;
  let fhaInvestable = Math.max(0, totalAvailableCash - fhaDown - fhaClosing);
  let fhaBalance = fhaLoan;

  // Conventional setup
  const convDown = homePrice * 0.20;
  const convLoan = homePrice - convDown;
  const convPandI = pmt(convLoan, mortgageRate, loanTermYears);
  const convClosing = homePrice * buyingClosingCostsPct / 100;
  let convInvestable = Math.max(0, totalAvailableCash - convDown - convClosing);
  let convBalance = convLoan;

  // Rent setup
  let rentInvestable = totalAvailableCash;

  const monthly: MonthlySnapshot[] = [];
  let fhaPayoffMonth: number | null = null;
  let convPayoffMonth: number | null = null;

  for (let m = 1; m <= 360; m++) {
    const homeValue = homePrice * Math.pow(1 + appreciationPct / 100, m / 12);
    const propTax = homeValue * propertyTaxPct / 100 / 12;
    const maintenance = homeValue * maintenancePct / 100 / 12;

    // FHA month
    let fhaPICost = 0;
    let fhaMIPCost = 0;
    if (fhaBalance > 0) {
      const interest = fhaBalance * monthlyRate;
      const principalPaid = Math.min(fhaBalance, fhaPandI - interest + extraMonthlyPrincipal);
      fhaBalance = Math.max(0, fhaBalance - principalPaid);
      fhaPICost = fhaPandI + (fhaBalance > 0 ? extraMonthlyPrincipal : 0);
      fhaMIPCost = fhaMonthlyMIP;
      if (fhaBalance === 0 && fhaPayoffMonth === null) fhaPayoffMonth = m;
    }
    const fhaMonthlyHousing = fhaPICost + fhaMIPCost + propTax + maintenance + monthlyHoa + monthlyInsurance;
    const fhaMonthlyAvailable = monthlyNetIncome - monthlyFixedBuying - fhaMonthlyHousing;
    fhaInvestable = fhaInvestable * (1 + monthlyROI) + Math.max(0, fhaMonthlyAvailable);

    // Compute FHA net worth
    const fhaGain = homeValue - homePrice;
    const fhaTaxableGain = Math.max(0, fhaGain - exclusion);
    const fhaCapGainsTax = fhaTaxableGain * capGainsRatePct / 100;
    const fhaNetSale = homeValue - fhaBalance - homeValue * sellingClosingCostsPct / 100 - fhaCapGainsTax;
    const fhaNW = fhaInvestable + Math.max(0, fhaNetSale);

    // Conv month
    let convPICost = 0;
    if (convBalance > 0) {
      const interest = convBalance * monthlyRate;
      const principalPaid = Math.min(convBalance, convPandI - interest + extraMonthlyPrincipal);
      convBalance = Math.max(0, convBalance - principalPaid);
      convPICost = convPandI + (convBalance > 0 ? extraMonthlyPrincipal : 0);
      if (convBalance === 0 && convPayoffMonth === null) convPayoffMonth = m;
    }
    const convMonthlyHousing = convPICost + propTax + maintenance + monthlyHoa + monthlyInsurance;
    const convMonthlyAvailable = monthlyNetIncome - monthlyFixedBuying - convMonthlyHousing;
    convInvestable = convInvestable * (1 + monthlyROI) + Math.max(0, convMonthlyAvailable);

    // Compute Conv net worth
    const convGain = homeValue - homePrice;
    const convTaxableGain = Math.max(0, convGain - exclusion);
    const convCapGainsTax = convTaxableGain * capGainsRatePct / 100;
    const convNetSale = homeValue - convBalance - homeValue * sellingClosingCostsPct / 100 - convCapGainsTax;
    const convNW = convInvestable + Math.max(0, convNetSale);

    // Rent month
    const currentRent = monthlyRent * Math.pow(1 + rentIncreasePct / 100, m / 12);
    const rentMonthly = currentRent + monthlyRentersInsurance;
    rentInvestable = rentInvestable * (1 + monthlyROI) + Math.max(0, rentMonthlyAvailable);
    const rentNW = rentInvestable;

    monthly.push({
      month: m,
      fhaNW, convNW, rentNW,
      fhaMonthly: fhaMonthlyHousing,
      convMonthly: convMonthlyHousing,
      rentMonthly,
      fhaBalance, convBalance,
    });
  }

  return { monthly, fhaPayoffMonth, convPayoffMonth };
}

// ─── UI Components ────────────────────────────────────────────────────────────

function Section({
  title, children, defaultOpen = true,
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
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

function Field({
  label, value, onChange, step, prefix, suffix, hint, readOnly,
}: {
  label: string; value: number; onChange?: (v: number) => void;
  step?: number; prefix?: string; suffix?: string; hint?: string; readOnly?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-3 text-sm text-muted-foreground pointer-events-none">{prefix}</span>
        )}
        <Input
          type="number"
          step={step ?? 1}
          value={value}
          readOnly={readOnly}
          onChange={onChange ? (e) => onChange(parseFloat(e.target.value) || 0) : undefined}
          className={`${prefix ? 'pl-6' : ''} ${suffix ? 'pr-10' : ''} ${readOnly ? 'bg-muted/30 cursor-default' : ''}`}
        />
        {suffix && (
          <span className="absolute right-3 text-sm text-muted-foreground pointer-events-none">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface CostBreakdown {
  pandI: number;
  mip: number;
  tax: number;
  insurance: number;
  hoa: number;
  maintenance: number;
  total: number;
}

function CostBadge({
  label, value, breakdown, color,
}: {
  label: string; value: number; breakdown?: CostBreakdown; color: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div
      className="relative flex-1 text-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div className={`text-xs font-medium ${color}`}>{label}</div>
      <div className="text-lg font-bold">{fmtMo(value)}</div>
      {show && breakdown && (
        <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-popover border rounded-lg p-3 shadow-lg text-xs w-52 text-left space-y-1">
          <div className="font-semibold mb-1">Cost breakdown:</div>
          <div className="flex justify-between"><span>P&I</span><span>{fmtFull(breakdown.pandI)}</span></div>
          {breakdown.mip > 0 && <div className="flex justify-between text-amber-600"><span>MIP</span><span>{fmtFull(breakdown.mip)}</span></div>}
          <div className="flex justify-between"><span>Property Tax</span><span>{fmtFull(breakdown.tax)}</span></div>
          <div className="flex justify-between"><span>Insurance</span><span>{fmtFull(breakdown.insurance)}</span></div>
          {breakdown.hoa > 0 && <div className="flex justify-between"><span>HOA</span><span>{fmtFull(breakdown.hoa)}</span></div>}
          <div className="flex justify-between"><span>Maintenance</span><span>{fmtFull(breakdown.maintenance)}</span></div>
          <div className="flex justify-between font-semibold border-t pt-1 mt-1">
            <span>Total</span><span>{fmtFull(breakdown.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DEFAULT: Inputs = {
  homePrice: 750_000,
  appreciationPct: 4,
  buyingClosingCostsPct: 3,
  sellingClosingCostsPct: 7,
  mortgageRate: 6.75,
  loanTermYears: 30,
  extraMonthlyPrincipal: 0,
  monthlyRent: 2800,
  rentIncreasePct: 4,
  monthlyRentersInsurance: 20,
  maintenancePct: 1.5,
  monthlyHoa: 0,
  monthlyInsurance: 150,
  propertyTaxPct: 1.0,
  totalAvailableCash: 100_000,
  investmentRoi: 7,
  annualSalary: 90_000,
  taxRatePct: 32,
  monthlyFixedRenting: 3500,
  monthlyFixedBuying: 4000,
  filingStatus: 'single',
  capGainsRatePct: 15,
};

export default function RentVsBuyPage() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULT);

  function set<K extends keyof Inputs>(key: K, value: Inputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  function setNum(key: keyof Inputs) {
    return (v: number) => set(key, v as Inputs[typeof key]);
  }

  const { monthly, fhaPayoffMonth, convPayoffMonth } = useMemo(() => simulate(inputs), [inputs]);

  // ─── Income & Cash Flow ──────────────────────────────────────────────────────
  const monthlyNetIncome = inputs.annualSalary / 12 * (1 - inputs.taxRatePct / 100);

  // Month 1 housing costs (from simulation)
  const m1 = monthly[0];
  const rentHousingCost = inputs.monthlyRent; // rent payment itself
  const rentOtherExpenses = inputs.monthlyFixedRenting - inputs.monthlyRent; // remaining fixed
  const rentMonthlyAvailable = monthlyNetIncome - inputs.monthlyFixedRenting;
  const fhaMonthlyAvailable = monthlyNetIncome - inputs.monthlyFixedBuying - m1.fhaMonthly;
  const convMonthlyAvailable = monthlyNetIncome - inputs.monthlyFixedBuying - m1.convMonthly;

  const rentNegative = rentMonthlyAvailable < 0;
  const fhaNegative = fhaMonthlyAvailable < 0;
  const convNegative = convMonthlyAvailable < 0;
  const anyNegative = rentNegative || fhaNegative || convNegative;

  // ─── Down Payment Savings Timeline ───────────────────────────────────────────
  const { monthsToFHA, monthsToConv } = useMemo(() => {
    const fhaTarget = inputs.homePrice * (0.035 + inputs.buyingClosingCostsPct / 100);
    const convTarget = inputs.homePrice * (0.20 + inputs.buyingClosingCostsPct / 100);
    const monthlySave = Math.max(0, monthlyNetIncome - inputs.monthlyFixedRenting);
    const roi = inputs.investmentRoi / 100 / 12;

    let savings = inputs.totalAvailableCash;
    let toFHA: number | null = savings >= fhaTarget ? 0 : null;
    let toConv: number | null = savings >= convTarget ? 0 : null;

    for (let m = 1; m <= 600 && (toFHA === null || toConv === null); m++) {
      savings = savings * (1 + roi) + monthlySave;
      if (toFHA === null && savings >= fhaTarget) toFHA = m;
      if (toConv === null && savings >= convTarget) toConv = m;
    }
    return { monthsToFHA: toFHA, monthsToConv: toConv };
  }, [inputs, monthlyNetIncome]);

  // ─── Existing Derived Values ─────────────────────────────────────────────────
  const fhaDown = inputs.homePrice * 0.035;
  const convDown = inputs.homePrice * 0.20;
  const fhaBaseLoan = inputs.homePrice - fhaDown;
  const fhaLoan = fhaBaseLoan + fhaBaseLoan * 0.0175;
  const convLoan = inputs.homePrice - convDown;

  // Month 12 (year 1) costs
  const m12 = monthly[11];
  const fhaBreakdown12: CostBreakdown = (() => {
    const homeVal = inputs.homePrice * Math.pow(1 + inputs.appreciationPct / 100, 1);
    const propTax = homeVal * inputs.propertyTaxPct / 100 / 12;
    const maintenance = homeVal * inputs.maintenancePct / 100 / 12;
    const pandI = pmt(fhaLoan, inputs.mortgageRate, inputs.loanTermYears);
    const mip = fhaLoan * 0.0055 / 12;
    const total = pandI + mip + propTax + inputs.monthlyInsurance + inputs.monthlyHoa + maintenance;
    return { pandI, mip, tax: propTax, insurance: inputs.monthlyInsurance, hoa: inputs.monthlyHoa, maintenance, total };
  })();
  const convBreakdown12: CostBreakdown = (() => {
    const homeVal = inputs.homePrice * Math.pow(1 + inputs.appreciationPct / 100, 1);
    const propTax = homeVal * inputs.propertyTaxPct / 100 / 12;
    const maintenance = homeVal * inputs.maintenancePct / 100 / 12;
    const pandI = pmt(convLoan, inputs.mortgageRate, inputs.loanTermYears);
    const total = pandI + propTax + inputs.monthlyInsurance + inputs.monthlyHoa + maintenance;
    return { pandI, mip: 0, tax: propTax, insurance: inputs.monthlyInsurance, hoa: inputs.monthlyHoa, maintenance, total };
  })();

  // Break-even years
  const fhaBreakEvenYear = useMemo(() => {
    for (let i = 0; i < monthly.length; i++) {
      if (monthly[i].fhaNW >= monthly[i].rentNW) return Math.ceil((i + 1) / 12);
    }
    return null;
  }, [monthly]);

  const convBreakEvenYear = useMemo(() => {
    for (let i = 0; i < monthly.length; i++) {
      if (monthly[i].convNW >= monthly[i].rentNW) return Math.ceil((i + 1) / 12);
    }
    return null;
  }, [monthly]);

  const convVsFhaBreakEvenYear = useMemo(() => {
    for (let i = 0; i < monthly.length; i++) {
      if (monthly[i].convNW >= monthly[i].fhaNW) return Math.ceil((i + 1) / 12);
    }
    return null;
  }, [monthly]);

  // Table rows
  const TABLE_YEARS = [5, 7, 10, 15, 20, 30];
  const tableRows: YearlyRow[] = TABLE_YEARS.map((yr) => {
    const snap = monthly[yr * 12 - 1];
    const best = snap.rentNW >= snap.fhaNW && snap.rentNW >= snap.convNW
      ? 'rent'
      : snap.fhaNW >= snap.convNW ? 'fha' : 'conv';
    return {
      year: yr,
      rentNW: snap.rentNW,
      fhaNW: snap.fhaNW,
      convNW: snap.convNW,
      rentMonthly: snap.rentMonthly,
      fhaMonthly: snap.fhaMonthly,
      convMonthly: snap.convMonthly,
      best,
    };
  });

  // Net worth chart data (yearly points)
  const nwChartData = useMemo(() => {
    const pts = [{ year: 0, rent: inputs.totalAvailableCash, fha: 0, conv: 0 }];
    for (let yr = 1; yr <= 30; yr++) {
      const snap = monthly[yr * 12 - 1];
      pts.push({ year: yr, rent: snap.rentNW, fha: snap.fhaNW, conv: snap.convNW });
    }
    return pts;
  }, [monthly, inputs.totalAvailableCash]);

  // Monthly cost chart data (at select years)
  const COST_YEARS = [0, 5, 10, 15, 20, 25, 30];
  const costChartData = useMemo(() => {
    return COST_YEARS.map((yr) => {
      if (yr === 0) {
        return {
          year: 'Now',
          rent: inputs.monthlyRent + inputs.monthlyRentersInsurance,
          fha: fhaBreakdown12.total,
          conv: convBreakdown12.total,
        };
      }
      const snap = monthly[yr * 12 - 1];
      return {
        year: `Yr ${yr}`,
        rent: snap.rentMonthly,
        fha: snap.fhaMonthly,
        conv: snap.convMonthly,
      };
    });
  }, [monthly, inputs, fhaBreakdown12, convBreakdown12]);

  // Payoff info
  const fhaPayoffYear = fhaPayoffMonth ? Math.ceil(fhaPayoffMonth / 12) : null;
  const convPayoffYear = convPayoffMonth ? Math.ceil(convPayoffMonth / 12) : null;

  const postPayoffFHASavings = fhaPayoffMonth
    ? (() => {
        const snap = monthly[fhaPayoffMonth];
        return snap ? snap.rentMonthly - snap.fhaMonthly : null;
      })()
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-[1400px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Home className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Rent vs. Buy Forecaster</h1>
            <p className="text-sm text-muted-foreground">FHA (3.5% down) · Conventional (20% down) · Rent — 30-year simulation</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* ─── Left: Inputs ──────────────────────────────────────────── */}
          <div className="space-y-3">
            {/* Income & Taxes — NEW */}
            <Section title="💰 Income & Taxes" defaultOpen={true}>
              <Field label="Annual Gross Salary" value={inputs.annualSalary} onChange={setNum('annualSalary')} prefix="$" step={5000} />
              <Field label="Combined Tax Rate (federal + FICA)" value={inputs.taxRatePct} onChange={setNum('taxRatePct')} suffix="%" step={1} hint="No WA state income tax" />
              <Field
                label="Monthly Fixed Expenses — Renting"
                value={inputs.monthlyFixedRenting}
                onChange={setNum('monthlyFixedRenting')}
                prefix="$"
                step={100}
                hint="Includes rent, food, utilities, etc."
              />
              <Field
                label="Monthly Fixed Expenses — If Buying"
                value={inputs.monthlyFixedBuying}
                onChange={setNum('monthlyFixedBuying')}
                prefix="$"
                step={100}
                hint="Food, utilities, car — excludes housing"
              />
              <div className="bg-muted/30 rounded-md p-3 text-xs space-y-1 border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Monthly net income:</span>
                  <span className="font-semibold">{fmtFull(monthlyNetIncome)}</span>
                </div>
                <div className="flex justify-between text-blue-600">
                  <span>Renting — available/mo:</span>
                  <span className={`font-semibold ${rentNegative ? 'text-red-500' : 'text-blue-600'}`}>
                    {fmtFull(rentMonthlyAvailable)}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>FHA — available/mo (est.):</span>
                  <span className={`font-semibold ${fhaNegative ? 'text-red-500' : 'text-emerald-600'}`}>
                    {fmtFull(fhaMonthlyAvailable)}
                  </span>
                </div>
                <div className="flex justify-between text-orange-600">
                  <span>Conv — available/mo (est.):</span>
                  <span className={`font-semibold ${convNegative ? 'text-red-500' : 'text-orange-600'}`}>
                    {fmtFull(convMonthlyAvailable)}
                  </span>
                </div>
              </div>
            </Section>

            <Section title="🏠 Property">
              <Field label="Home Price" value={inputs.homePrice} onChange={setNum('homePrice')} prefix="$" step={5000} />
              <Field label="Annual Appreciation" value={inputs.appreciationPct} onChange={setNum('appreciationPct')} suffix="%" step={0.1} />
              <Field label="Buying Closing Costs" value={inputs.buyingClosingCostsPct} onChange={setNum('buyingClosingCostsPct')} suffix="%" step={0.1} />
              <Field label="Selling Closing Costs" value={inputs.sellingClosingCostsPct} onChange={setNum('sellingClosingCostsPct')} suffix="%" step={0.1} />
            </Section>

            <Section title="🏦 Mortgage">
              <Field label="Interest Rate" value={inputs.mortgageRate} onChange={setNum('mortgageRate')} suffix="%" step={0.125} />
              <Field label="Loan Term" value={inputs.loanTermYears} onChange={setNum('loanTermYears')} suffix="yrs" />
              <Field label="Extra Monthly Principal" value={inputs.extraMonthlyPrincipal} onChange={setNum('extraMonthlyPrincipal')} prefix="$" step={50} />
              <div className="grid grid-cols-2 gap-3 pt-1 border-t">
                <Field label="FHA Down (3.5%)" value={Math.round(fhaDown)} readOnly prefix="$" hint="Auto-calculated" />
                <Field label="FHA Loan Amount" value={Math.round(fhaLoan)} readOnly prefix="$" hint="Incl. upfront MIP" />
                <Field label="Conv Down (20%)" value={Math.round(convDown)} readOnly prefix="$" hint="Auto-calculated" />
                <Field label="Conv Loan Amount" value={Math.round(convLoan)} readOnly prefix="$" />
              </div>
            </Section>

            <Section title="🏢 Rent">
              <Field label="Monthly Rent" value={inputs.monthlyRent} onChange={setNum('monthlyRent')} prefix="$" step={50} />
              <Field label="Annual Rent Increase" value={inputs.rentIncreasePct} onChange={setNum('rentIncreasePct')} suffix="%" step={0.1} />
              <Field label="Renter's Insurance" value={inputs.monthlyRentersInsurance} onChange={setNum('monthlyRentersInsurance')} prefix="$" />
            </Section>

            <Section title="🔧 Operating Costs (Buyers)" defaultOpen={false}>
              <Field label="Annual Maintenance (% of value)" value={inputs.maintenancePct} onChange={setNum('maintenancePct')} suffix="%" step={0.1} />
              <Field label="Monthly HOA" value={inputs.monthlyHoa} onChange={setNum('monthlyHoa')} prefix="$" />
              <Field label="Monthly Homeowners Insurance" value={inputs.monthlyInsurance} onChange={setNum('monthlyInsurance')} prefix="$" />
              <Field label="Annual Property Tax (% of value)" value={inputs.propertyTaxPct} onChange={setNum('propertyTaxPct')} suffix="%" step={0.05} />
            </Section>

            <Section title="📈 Financial" defaultOpen={false}>
              <Field label="Total Available Cash" value={inputs.totalAvailableCash} onChange={setNum('totalAvailableCash')} prefix="$" step={5000} hint="Savings/down payment pool" />
              <Field label="Annual Investment ROI" value={inputs.investmentRoi} onChange={setNum('investmentRoi')} suffix="%" step={0.5} />
            </Section>

            <Section title="🧾 Tax" defaultOpen={false}>
              <div className="space-y-1">
                <Label className="text-xs">Filing Status</Label>
                <div className="flex gap-2">
                  {(['single', 'married'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set('filingStatus', s)}
                      className={`flex-1 py-2 text-sm rounded-md border transition-colors ${inputs.filingStatus === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30 hover:bg-muted/60'}`}
                    >
                      {s === 'single' ? 'Single ($250k excl.)' : 'Married ($500k excl.)'}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Long-term Capital Gains Rate" value={inputs.capGainsRatePct} onChange={setNum('capGainsRatePct')} suffix="%" step={1} />
            </Section>
          </div>

          {/* ─── Right: Results ────────────────────────────────────────── */}
          <div className="space-y-5">
            {/* ─── Monthly Cash Flow Card — NEW ──────────────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Monthly Cash Flow (Year 1)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {anyNegative && (
                  <div className="flex items-start gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 mb-4 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      {[rentNegative && 'Renting', fhaNegative && 'FHA Buy', convNegative && 'Conv Buy'].filter(Boolean).join(', ')} result{anyNegative && (rentNegative && fhaNegative && convNegative ? '' : 's')} in negative monthly cash flow — you&apos;d be spending more than you earn each month.
                    </span>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 text-muted-foreground font-medium text-xs"></th>
                        <th className="text-right py-2 px-3 text-blue-500 font-medium text-xs">Rent</th>
                        <th className="text-right py-2 px-3 text-emerald-500 font-medium text-xs">FHA Buy</th>
                        <th className="text-right py-2 pl-3 text-orange-500 font-medium text-xs">Conv Buy</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      <tr className="border-b">
                        <td className="py-2 pr-4 text-muted-foreground text-xs">Monthly income</td>
                        <td className="text-right py-2 px-3 font-medium">{fmtFull(monthlyNetIncome)}</td>
                        <td className="text-right py-2 px-3 font-medium">{fmtFull(monthlyNetIncome)}</td>
                        <td className="text-right py-2 pl-3 font-medium">{fmtFull(monthlyNetIncome)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 pr-4 text-muted-foreground text-xs">Housing costs</td>
                        <td className="text-right py-2 px-3 text-blue-600">{fmtFull(rentHousingCost)}</td>
                        <td className="text-right py-2 px-3 text-emerald-600">{fmtFull(m1.fhaMonthly)}</td>
                        <td className="text-right py-2 pl-3 text-orange-600">{fmtFull(m1.convMonthly)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 pr-4 text-muted-foreground text-xs">Other expenses</td>
                        <td className="text-right py-2 px-3">{fmtFull(rentOtherExpenses)}</td>
                        <td className="text-right py-2 px-3">{fmtFull(inputs.monthlyFixedBuying)}</td>
                        <td className="text-right py-2 pl-3">{fmtFull(inputs.monthlyFixedBuying)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-xs font-semibold">Available/mo</td>
                        <td className={`text-right py-2 px-3 font-bold ${rentNegative ? 'text-red-500' : 'text-blue-600'}`}>
                          {fmtFull(rentMonthlyAvailable)}
                          {rentNegative && ' ⚠️'}
                        </td>
                        <td className={`text-right py-2 px-3 font-bold ${fhaNegative ? 'text-red-500' : 'text-emerald-600'}`}>
                          {fmtFull(fhaMonthlyAvailable)}
                          {fhaNegative && ' ⚠️'}
                        </td>
                        <td className={`text-right py-2 pl-3 font-bold ${convNegative ? 'text-red-500' : 'text-orange-600'}`}>
                          {fmtFull(convMonthlyAvailable)}
                          {convNegative && ' ⚠️'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Rent: housing = rent payment; other = remaining fixed expenses. Available amount is invested at {inputs.investmentRoi}% ROI. Negative → $0 invested.
                </p>
              </CardContent>
            </Card>

            {/* ─── Down Payment Savings Timeline — NEW ───────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  Down Payment Savings Timeline (Rent Scenario)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">FHA Down Payment</div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Target: {fmtFull(inputs.homePrice * (0.035 + inputs.buyingClosingCostsPct / 100))}
                      <span className="ml-1">(3.5% + {inputs.buyingClosingCostsPct}% closing)</span>
                    </div>
                    {monthsToFHA === null ? (
                      <Badge variant="outline" className="text-xs text-red-500 border-red-400">
                        Never (no savings surplus)
                      </Badge>
                    ) : monthsToFHA === 0 ? (
                      <Badge variant="outline" className="text-xs border-emerald-500 text-emerald-600">
                        ✓ Can buy FHA now
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs border-blue-500 text-blue-600">
                        {monthsToFHA} months ({(monthsToFHA / 12).toFixed(1)} yrs)
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Conventional Down Payment</div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Target: {fmtFull(inputs.homePrice * (0.20 + inputs.buyingClosingCostsPct / 100))}
                      <span className="ml-1">(20% + {inputs.buyingClosingCostsPct}% closing)</span>
                    </div>
                    {monthsToConv === null ? (
                      <Badge variant="outline" className="text-xs text-red-500 border-red-400">
                        Never (no savings surplus)
                      </Badge>
                    ) : monthsToConv === 0 ? (
                      <Badge variant="outline" className="text-xs border-emerald-500 text-emerald-600">
                        ✓ Can buy Conv now
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                        {monthsToConv} months ({(monthsToConv / 12).toFixed(1)} yrs)
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Based on renting monthly surplus ({fmtFull(Math.max(0, rentMonthlyAvailable))}/mo) + current cash ({fmtFull(inputs.totalAvailableCash)}) compounding at {inputs.investmentRoi}% ROI.
                </p>
              </CardContent>
            </Card>

            {/* Monthly Cost Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Monthly Housing Cost at Year 1
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 divide-x">
                  <CostBadge
                    label="Rent"
                    value={m12.rentMonthly}
                    color="text-blue-500"
                  />
                  <div className="pl-4 flex-1">
                    <CostBadge
                      label="FHA (3.5% down)"
                      value={m12.fhaMonthly}
                      breakdown={fhaBreakdown12}
                      color="text-emerald-500"
                    />
                  </div>
                  <div className="pl-4 flex-1">
                    <CostBadge
                      label="Conventional (20% down)"
                      value={m12.convMonthly}
                      breakdown={convBreakdown12}
                      color="text-orange-500"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Hover over FHA/Conv to see cost breakdown.</p>
              </CardContent>
            </Card>

            {/* Break-even & Payoff */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card className="p-4 space-y-2">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Break-even Points
                </div>
                <div className="space-y-1.5">
                  {fhaBreakEvenYear ? (
                    <Badge variant="outline" className="text-xs border-emerald-500 text-emerald-600">
                      FHA beats rent at year {fhaBreakEvenYear}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">FHA never beats rent (30yr)</Badge>
                  )}
                  {convBreakEvenYear ? (
                    <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                      Conv beats rent at year {convBreakEvenYear}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Conv never beats rent (30yr)</Badge>
                  )}
                  {convVsFhaBreakEvenYear ? (
                    <Badge variant="outline" className="text-xs border-purple-500 text-purple-600">
                      Conv beats FHA at year {convVsFhaBreakEvenYear}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">FHA leads Conv throughout (30yr)</Badge>
                  )}
                </div>
              </Card>

              <Card className="p-4 space-y-2">
                <div className="text-sm font-semibold">🎉 Loan Payoff</div>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-emerald-600 font-medium">FHA payoff: </span>
                    {fhaPayoffYear ? `Year ${fhaPayoffYear}` : 'Year 30 (end of term)'}
                  </div>
                  <div>
                    <span className="text-orange-600 font-medium">Conv payoff: </span>
                    {convPayoffYear ? `Year ${convPayoffYear}` : 'Year 30 (end of term)'}
                  </div>
                  {postPayoffFHASavings !== null && postPayoffFHASavings > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Post-payoff FHA saves <span className="font-medium text-emerald-600">{fmtFull(postPayoffFHASavings)}/mo</span> vs rent at payoff year
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Net Worth Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Net Worth Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Year</th>
                        <th className="text-right py-2 px-3 text-blue-500 font-medium">Rent NW</th>
                        <th className="text-right py-2 px-3 text-emerald-500 font-medium">FHA NW</th>
                        <th className="text-right py-2 px-3 text-orange-500 font-medium">Conv NW</th>
                        <th className="text-right py-2 pl-3 text-muted-foreground font-medium">Best</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row) => (
                        <tr key={row.year} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-2 pr-3 font-medium">{row.year}</td>
                          <td className={`text-right py-2 px-3 ${row.best === 'rent' ? 'font-bold text-blue-600' : ''}`}>{fmt(row.rentNW)}</td>
                          <td className={`text-right py-2 px-3 ${row.best === 'fha' ? 'font-bold text-emerald-600' : ''}`}>{fmt(row.fhaNW)}</td>
                          <td className={`text-right py-2 px-3 ${row.best === 'conv' ? 'font-bold text-orange-600' : ''}`}>{fmt(row.convNW)}</td>
                          <td className="text-right py-2 pl-3">
                            <Badge
                              variant="outline"
                              className={`text-xs ${row.best === 'rent' ? 'border-blue-500 text-blue-600' : row.best === 'fha' ? 'border-emerald-500 text-emerald-600' : 'border-orange-500 text-orange-600'}`}
                            >
                              {row.best.toUpperCase()}
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
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Net Worth Over 30 Years</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={nwChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="year" tickFormatter={(v) => `Yr ${v}`} className="text-xs" />
                      <YAxis tickFormatter={(v) => fmt(v)} className="text-xs" width={60} />
                      <RechartsTooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any, name: any) => [fmtFull(Number(value)), name === 'rent' ? 'Rent' : name === 'fha' ? 'FHA' : 'Conv'] as [string, string]}
                        labelFormatter={(l) => `Year ${l}`}
                      />
                      <Legend formatter={(v) => v === 'rent' ? 'Rent' : v === 'fha' ? 'FHA (3.5%)' : 'Conv (20%)'} />
                      {fhaBreakEvenYear && (
                        <ReferenceLine x={fhaBreakEvenYear} stroke="#10b981" strokeDasharray="4 4" label={{ value: `FHA BE Yr${fhaBreakEvenYear}`, fontSize: 10, fill: '#10b981' }} />
                      )}
                      {convBreakEvenYear && convBreakEvenYear !== fhaBreakEvenYear && (
                        <ReferenceLine x={convBreakEvenYear} stroke="#f97316" strokeDasharray="4 4" label={{ value: `Conv BE Yr${convBreakEvenYear}`, fontSize: 10, fill: '#f97316' }} />
                      )}
                      <Line type="monotone" dataKey="rent" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="fha" stroke="#10b981" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="conv" stroke="#f97316" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Monthly Cost Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Monthly Housing Cost Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="year" className="text-xs" />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} className="text-xs" width={50} />
                      <RechartsTooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any, name: any) => [fmtMo(Number(value)), name === 'rent' ? 'Rent' : name === 'fha' ? 'FHA' : 'Conv'] as [string, string]}
                      />
                      <Legend formatter={(v) => v === 'rent' ? 'Rent' : v === 'fha' ? 'FHA (3.5%)' : 'Conv (20%)'} />
                      <Bar dataKey="rent" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="fha" fill="#10b981" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="conv" fill="#f97316" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Buy costs drop after loan payoff. Rent grows with inflation.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
