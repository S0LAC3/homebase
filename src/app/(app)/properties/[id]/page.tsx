'use client';

import { useEffect, useState, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  MapPin, Bed, Bath, Ruler, Calendar, ExternalLink, Trash2, ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  calculateMortgage, generateAmortizationSchedule, formatCurrency, formatCurrencyDetailed,
  FHA_LOAN_LIMIT_KING_COUNTY,
} from '@/lib/mortgage';
import type { Property, MortgageScenario, LoanType } from '@/types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

export default function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading, activeBuyerId, isAdvisor } = useAuth();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [scenarios, setScenarios] = useState<MortgageScenario[]>([]);
  const [loading, setLoading] = useState(true);

  const [calcForm, setCalcForm] = useState({
    loanType: 'FHA' as LoanType,
    downPaymentPercent: '3.5',
    interestRate: '6.5',
    loanTermYears: '30',
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user || !activeBuyerId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const fetchData = async () => {
      try {
        const [propRes, scenRes] = await Promise.all([
          supabase.from('properties').select('*').eq('id', id).eq('user_id', activeBuyerId).single(),
          supabase.from('mortgage_scenarios').select('*').eq('property_id', id).eq('user_id', activeBuyerId).order('created_at', { ascending: false }),
        ]);
        setProperty(propRes.data);
        setScenarios(scenRes.data ?? []);
      } catch (error) {
        console.error('Property detail: failed to fetch data', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, authLoading, id, activeBuyerId]);

  const handleCalculate = async () => {
    if (!user || !property || isAdvisor) return;
    const calc = calculateMortgage({
      loanType: calcForm.loanType,
      purchasePrice: property.price,
      downPaymentPercent: parseFloat(calcForm.downPaymentPercent),
      interestRate: parseFloat(calcForm.interestRate),
      loanTermYears: parseInt(calcForm.loanTermYears),
      hoaMonthly: property.hoa_monthly ?? 0,
      propertyTaxAnnual: property.property_tax_annual ?? undefined,
    });

    const supabase = createClient();
    const { data, error } = await supabase
      .from('mortgage_scenarios')
      .insert({
        property_id: property.id,
        user_id: user.id,
        loan_type: calc.loanType,
        purchase_price: calc.purchasePrice,
        down_payment_percent: calc.downPaymentPercent,
        down_payment_amount: calc.downPaymentAmount,
        interest_rate: calc.interestRate,
        loan_term_years: calc.loanTermYears,
        monthly_payment: calc.monthlyPrincipalAndInterest,
        monthly_mip_or_pmi: calc.monthlyMipOrPmi,
        total_monthly_cost: calc.totalMonthlyPayment,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to save scenario');
    } else if (data) {
      setScenarios([data, ...scenarios]);
      toast.success('Mortgage scenario saved!');
    }
  };

  const handleDelete = async () => {
    if (!user || !property || isAdvisor) return;
    const supabase = createClient();
    await supabase.from('mortgage_scenarios').delete().eq('property_id', property.id);
    await supabase.from('properties').delete().eq('id', property.id);
    toast.success('Property deleted');
    router.push('/properties');
  };

  // Amortization for first scenario
  const amortData = scenarios[0]
    ? generateAmortizationSchedule(
        scenarios[0].purchase_price - scenarios[0].down_payment_amount,
        scenarios[0].interest_rate,
        scenarios[0].loan_term_years
      )
        .filter((_, i) => i % 12 === 11)
        .map((row) => ({
          year: Math.ceil(row.month / 12),
          principal: Math.round(row.principal * 12),
          interest: Math.round(row.interest * 12),
          balance: Math.round(row.balance),
        }))
    : [];

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-12">
        <p>Property not found.</p>
        <Button variant="link"><Link href="/properties">Back to properties</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon">
          <Link href="/properties"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{formatCurrency(property.price)}</h1>
          <p className="text-muted-foreground flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {property.address}, {property.city}, {property.state} {property.zip}
          </p>
        </div>
        {!isAdvisor && (
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Property Info */}
        <Card>
          <CardHeader><CardTitle>Property Details</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {property.bedrooms && (
                <div className="flex items-center gap-2"><Bed className="h-4 w-4 text-muted-foreground" /><span>{property.bedrooms} Bedrooms</span></div>
              )}
              {property.bathrooms && (
                <div className="flex items-center gap-2"><Bath className="h-4 w-4 text-muted-foreground" /><span>{property.bathrooms} Bathrooms</span></div>
              )}
              {property.sqft && (
                <div className="flex items-center gap-2"><Ruler className="h-4 w-4 text-muted-foreground" /><span>{property.sqft.toLocaleString()} sq ft</span></div>
              )}
              {property.year_built && (
                <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span>Built {property.year_built}</span></div>
              )}
            </div>
            <Separator className="my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">HOA/mo</span><span>{property.hoa_monthly ? formatCurrency(property.hoa_monthly) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Property Tax/yr</span><span>{property.property_tax_annual ? formatCurrency(property.property_tax_annual) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Price/sqft</span><span>{property.sqft ? formatCurrency(Math.round(property.price / property.sqft)) : '—'}</span></div>
            </div>
            {property.listing_url && (
              <a href={property.listing_url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-blue-600 hover:underline text-sm">
                View listing <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {property.notes && (
              <div className="mt-4 p-3 bg-muted rounded-md text-sm">{property.notes}</div>
            )}
          </CardContent>
        </Card>

        {/* Mortgage Calculator */}
        <Card>
          <CardHeader><CardTitle>Mortgage Calculator</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {(['FHA', 'Conventional', 'VA'] as LoanType[]).map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant={calcForm.loanType === type ? 'default' : 'outline'}
                  disabled={isAdvisor}
                  onClick={() => {
                    const dp = type === 'FHA' ? '3.5' : type === 'VA' ? '0' : '5';
                    setCalcForm({ ...calcForm, loanType: type, downPaymentPercent: dp });
                  }}
                >
                  {type}
                </Button>
              ))}
            </div>

            {calcForm.loanType === 'FHA' && property.price > FHA_LOAN_LIMIT_KING_COUNTY && (
              <p className="text-sm text-amber-600">⚠️ Price exceeds King County FHA limit ({formatCurrency(FHA_LOAN_LIMIT_KING_COUNTY)})</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Down Payment %</Label>
                <Input type="number" step="0.5" value={calcForm.downPaymentPercent} disabled={isAdvisor} onChange={(e) => setCalcForm({ ...calcForm, downPaymentPercent: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Interest Rate %</Label>
                <Input type="number" step="0.125" value={calcForm.interestRate} disabled={isAdvisor} onChange={(e) => setCalcForm({ ...calcForm, interestRate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Loan Term (years)</Label>
                <Input type="number" value={calcForm.loanTermYears} disabled={isAdvisor} onChange={(e) => setCalcForm({ ...calcForm, loanTermYears: e.target.value })} />
              </div>
            </div>

            {!isAdvisor && (
              <Button className="w-full" onClick={handleCalculate}>Calculate & Save</Button>
            )}

            {scenarios.length > 0 && (
              <div className="space-y-3 mt-4">
                <h3 className="font-semibold text-sm">Saved Scenarios</h3>
                {scenarios.map((s) => (
                  <div key={s.id} className="p-3 border rounded-md space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge>{s.loan_type}</Badge>
                      <span className="font-bold">{formatCurrencyDetailed(s.total_monthly_cost)}/mo</span>
                    </div>
                    <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
                      <span>Down: {s.down_payment_percent}% ({formatCurrency(s.down_payment_amount)})</span>
                      <span>Rate: {s.interest_rate}%</span>
                      <span>P&I: {formatCurrencyDetailed(s.monthly_payment)}</span>
                      <span>MIP/PMI: {formatCurrencyDetailed(s.monthly_mip_or_pmi)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Amortization Chart */}
      {amortData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Amortization Schedule</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={amortData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" label={{ value: 'Year', position: 'bottom' }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="balance" stroke="#3b82f6" name="Remaining Balance" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="principal" stroke="#10b981" name="Annual Principal" dot={false} />
                <Line type="monotone" dataKey="interest" stroke="#ef4444" name="Annual Interest" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
