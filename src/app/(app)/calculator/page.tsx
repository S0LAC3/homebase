'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  calculateMortgage, generateAmortizationSchedule, formatCurrency, formatCurrencyDetailed,
  FHA_LOAN_LIMIT_KING_COUNTY, FHA_DOWN_PAYMENT_PERCENT, FHA_UPFRONT_MIP_RATE, FHA_ANNUAL_MIP_RATE,
  WSHFC_PROGRAMS,
} from '@/lib/mortgage';
import type { LoanType, MortgageCalculation } from '@/types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar,
} from 'recharts';
import { Calculator, ExternalLink, Info } from 'lucide-react';

export default function CalculatorPage() {
  const [purchasePrice, setPurchasePrice] = useState('750000');
  const [downPayment, setDownPayment] = useState('');
  const [interestRate, setInterestRate] = useState('6.5');
  const [loanTermYears, setLoanTermYears] = useState('30');
  const [hoaMonthly, setHoaMonthly] = useState('0');
  const [propertyTaxAnnual, setPropertyTaxAnnual] = useState('');
  const [results, setResults] = useState<MortgageCalculation[]>([]);

  const handleCompare = () => {
    const price = parseFloat(purchasePrice);
    const rate = parseFloat(interestRate);
    const term = parseInt(loanTermYears);
    const hoa = parseFloat(hoaMonthly) || 0;
    const tax = propertyTaxAnnual ? parseFloat(propertyTaxAnnual) : undefined;

    const customDp = downPayment ? parseFloat(downPayment) : null;
    const customDpPercent = customDp !== null ? (customDp / price) * 100 : null;

    const configs: { type: LoanType; dp: number; label?: string }[] = [
      { type: 'FHA', dp: FHA_DOWN_PAYMENT_PERCENT },
      { type: 'Conventional', dp: 5 },
      { type: 'Conventional', dp: 20 },
      { type: 'VA', dp: 0 },
    ];

    // Add custom down payment scenario if provided
    if (customDpPercent !== null && customDpPercent > 0 && customDpPercent <= 100) {
      configs.unshift({ type: 'Conventional', dp: Math.round(customDpPercent * 100) / 100, label: `Custom (${formatCurrency(customDp!)})` });
    }

    const calcs = configs.map((c) =>
      calculateMortgage({
        loanType: c.type,
        purchasePrice: price,
        downPaymentPercent: c.dp,
        interestRate: rate,
        loanTermYears: term,
        hoaMonthly: hoa,
        propertyTaxAnnual: tax,
      })
    );

    setResults(calcs);
  };

  // Amortization for first result
  const amortData = results.length > 0
    ? generateAmortizationSchedule(results[0].loanAmount, results[0].interestRate, results[0].loanTermYears)
        .filter((_, i) => i % 12 === 11)
        .map((row) => ({
          year: Math.ceil(row.month / 12),
          principal: Math.round(row.principal * 12),
          interest: Math.round(row.interest * 12),
          balance: Math.round(row.balance),
        }))
    : [];

  const comparisonData = results.map((r) => ({
    name: `${r.loanType} ${r.downPaymentPercent}%`,
    'Monthly Payment': Math.round(r.totalMonthlyPayment),
    'Down Payment': Math.round(r.downPaymentAmount),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mortgage Calculator</h1>
        <p className="text-muted-foreground">Compare FHA, Conventional, and VA loan options for King County, WA.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Input */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Purchase Price ($)</Label>
              <Input type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Down Payment ($)</Label>
              <Input type="number" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} placeholder="Optional — compares standard options" />
              {downPayment && purchasePrice && (
                <p className="text-xs text-muted-foreground">
                  {((parseFloat(downPayment) / parseFloat(purchasePrice)) * 100).toFixed(1)}% of purchase price
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Interest Rate (%)</Label>
              <Input type="number" step="0.125" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Loan Term (years)</Label>
              <Input type="number" value={loanTermYears} onChange={(e) => setLoanTermYears(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Monthly HOA ($)</Label>
              <Input type="number" value={hoaMonthly} onChange={(e) => setHoaMonthly(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Annual Property Tax ($)</Label>
              <Input type="number" value={propertyTaxAnnual} onChange={(e) => setPropertyTaxAnnual(e.target.value)} placeholder="Auto: ~1% of price" />
            </div>
            <Button className="w-full" onClick={handleCompare}>Compare All Loans</Button>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
          {results.length > 0 ? (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                {results.map((r, i) => (
                  <Card key={i} className={i === 0 ? 'border-blue-200 bg-blue-50/50' : ''}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant={i === 0 ? 'default' : 'secondary'}>{r.loanType}</Badge>
                        <span className="text-xs text-muted-foreground">{r.downPaymentPercent}% down</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="text-2xl font-bold">{formatCurrencyDetailed(r.totalMonthlyPayment)}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                      <Separator />
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between"><span className="text-muted-foreground">Down Payment</span><span>{formatCurrency(r.downPaymentAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Loan Amount</span><span>{formatCurrency(r.loanAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">P&I</span><span>{formatCurrencyDetailed(r.monthlyPrincipalAndInterest)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">MIP/PMI</span><span>{formatCurrencyDetailed(r.monthlyMipOrPmi)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Property Tax</span><span>{formatCurrencyDetailed(r.monthlyPropertyTax)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">HOA</span><span>{formatCurrencyDetailed(r.monthlyHoa)}</span></div>
                        {r.upfrontMip > 0 && (
                          <div className="flex justify-between text-amber-600"><span>Upfront MIP</span><span>{formatCurrency(r.upfrontMip)}</span></div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Comparison Bar Chart */}
              <Card>
                <CardHeader><CardTitle>Monthly Payment Comparison</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={comparisonData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="Monthly Payment" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Amortization */}
              <Card>
                <CardHeader><CardTitle>Amortization Schedule (FHA)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={amortData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Legend />
                      <Line type="monotone" dataKey="balance" stroke="#3b82f6" name="Balance" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="principal" stroke="#10b981" name="Annual Principal" dot={false} />
                      <Line type="monotone" dataKey="interest" stroke="#ef4444" name="Annual Interest" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Calculator className="h-12 w-12 mb-4" />
                <p className="text-lg font-medium">Enter a price and compare loans</p>
                <p className="text-sm">We&apos;ll show FHA, Conventional (5% & 20%), and VA side by side.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* FHA Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Info className="h-5 w-5" /> FHA Loan Details — King County, WA</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p><strong>2025 FHA Loan Limit:</strong> {formatCurrency(FHA_LOAN_LIMIT_KING_COUNTY)}</p>
              <p><strong>Minimum Down Payment:</strong> {FHA_DOWN_PAYMENT_PERCENT}% (credit score 580+)</p>
              <p><strong>Upfront MIP:</strong> {(FHA_UPFRONT_MIP_RATE * 100).toFixed(2)}% of base loan amount</p>
              <p><strong>Annual MIP:</strong> {(FHA_ANNUAL_MIP_RATE * 100).toFixed(2)}% (for the life of the loan)</p>
            </div>
            <div className="space-y-2">
              <p><strong>Property Tax Rate:</strong> ~1% of assessed value (King County avg)</p>
              <p className="font-semibold mt-4">WA First-Time Buyer Programs:</p>
              {WSHFC_PROGRAMS.map((p) => (
                <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                  {p.name} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
