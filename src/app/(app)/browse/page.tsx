'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Save, CheckCircle2, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/mortgage';
import type { SearchPrefs } from '@/types';

// ── URL builder helpers ───────────────────────────────────────────────────────

function buildZillowUrl(prefs: SearchPrefs): string {
  const min = prefs.min_price ?? 500000;
  const max = prefs.max_price ?? 800000;
  const beds = prefs.min_beds ?? 2;
  const city = (prefs.city ?? 'Seattle, WA').split(',')[0].trim().toLowerCase().replace(/\s+/g, '-');
  const state = ((prefs.city ?? 'Seattle, WA').split(',')[1] ?? 'WA').trim().toLowerCase();
  const qs = JSON.stringify({ filterState: { price: { min, max }, beds: { min: beds } } });
  return `https://www.zillow.com/${city}-${state}/homes/?searchQueryState=${encodeURIComponent(qs)}`;
}

function buildRedfinUrl(prefs: SearchPrefs): string {
  const min = prefs.min_price ?? 500000;
  const max = prefs.max_price ?? 800000;
  const beds = prefs.min_beds ?? 2;
  const minK = Math.round(min / 1000) + 'k';
  const maxK = Math.round(max / 1000) + 'k';
  return `https://www.redfin.com/city/16163/WA/Seattle/filter/min-price=${minK},max-price=${maxK},min-beds=${beds}`;
}

function buildRealtorUrl(prefs: SearchPrefs): string {
  const min = prefs.min_price ?? 500000;
  const max = prefs.max_price ?? 800000;
  const beds = prefs.min_beds ?? 2;
  return `https://www.realtor.com/realestateandhomes-search/Seattle_WA/price-na-${min},${max}/beds-${beds}`;
}

function buildTruliaUrl(prefs: SearchPrefs): string {
  const min = prefs.min_price ?? 500000;
  const max = prefs.max_price ?? 800000;
  const beds = prefs.min_beds ?? 2;
  const minK = Math.round(min / 1000);
  const maxK = Math.round(max / 1000);
  return `https://www.trulia.com/for_sale/Seattle,WA/${minK}k-${maxK}k/${beds}bd/`;
}

function buildWindermereUrl(prefs: SearchPrefs): string {
  const min = prefs.min_price ?? 500000;
  const max = prefs.max_price ?? 800000;
  const beds = prefs.min_beds ?? 2;
  return `https://www.windermere.com/search#/?searchType=listings&city=Seattle&priceMin=${min}&priceMax=${max}&beds=${beds}`;
}

function buildJohnLScottUrl(prefs: SearchPrefs): string {
  const min = prefs.min_price ?? 500000;
  const max = prefs.max_price ?? 800000;
  const beds = prefs.min_beds ?? 2;
  return `https://www.johnlscott.com/property-search?city=Seattle&state=WA&minPrice=${min}&maxPrice=${max}&minBeds=${beds}`;
}

// ── Affordability math ────────────────────────────────────────────────────────

/**
 * Rough max affordable price based on 43% DTI.
 * Monthly income × 0.43 − monthly_debt = max housing payment.
 * Use 30-yr fixed P&I at ~7% → payment factor ≈ 0.006653 per dollar of loan.
 * Down payment assumed 3.5% (FHA) or 5% (Conventional).
 */
function calcAffordability(income: number | null, monthlyDebt: number | null) {
  if (!income) return null;
  const monthlyIncome = income / 12;
  const existingDebt = monthlyDebt ?? 0;
  const maxHousingPayment = monthlyIncome * 0.43 - existingDebt;
  if (maxHousingPayment <= 0) return null;

  // FHA: 3.5% down, rate ~6.75%, 30yr  → factor ~0.006487; add MIP ~0.55%/12
  const fhaRate = 0.0675 / 12;
  const fhaN = 360;
  const fhaPaymentFactor = (fhaRate * Math.pow(1 + fhaRate, fhaN)) / (Math.pow(1 + fhaRate, fhaN) - 1);
  const fhaMipFactor = 0.0055 / 12;
  // payment = loanAmount * (fhaPaymentFactor + mipFactor); loanAmount = price * 0.965
  const fhaMaxLoan = maxHousingPayment / (fhaPaymentFactor + fhaMipFactor);
  const fhaMaxPrice = Math.round(fhaMaxLoan / 0.965);

  // Conventional: 5% down, rate ~7.0%, 30yr
  const convRate = 0.07 / 12;
  const convN = 360;
  const convPaymentFactor = (convRate * Math.pow(1 + convRate, convN)) / (Math.pow(1 + convRate, convN) - 1);
  // PMI ~0.5%/12 until 20% equity; ignore for simplicity at max calc
  const convMaxLoan = maxHousingPayment / convPaymentFactor;
  const convMaxPrice = Math.round(convMaxLoan / 0.95);

  return { fha: fhaMaxPrice, conventional: convMaxPrice, maxHousingPayment };
}

// ── Platform card data ────────────────────────────────────────────────────────

const PLATFORMS = [
  {
    id: 'zillow',
    name: 'Zillow',
    emoji: '🏠',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    badgeColor: 'bg-blue-600',
    buildUrl: buildZillowUrl,
  },
  {
    id: 'redfin',
    name: 'Redfin',
    emoji: '🔴',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    badgeColor: 'bg-red-600',
    buildUrl: buildRedfinUrl,
  },
  {
    id: 'realtor',
    name: 'Realtor.com',
    emoji: '🏡',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    badgeColor: 'bg-orange-600',
    buildUrl: buildRealtorUrl,
  },
  {
    id: 'trulia',
    name: 'Trulia',
    emoji: '📍',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    badgeColor: 'bg-purple-600',
    buildUrl: buildTruliaUrl,
  },
  {
    id: 'windermere',
    name: 'Windermere',
    emoji: '🌲',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    badgeColor: 'bg-green-700',
    buildUrl: buildWindermereUrl,
  },
  {
    id: 'johnlscott',
    name: 'John L. Scott',
    emoji: '🏢',
    color: 'bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-300',
    badgeColor: 'bg-slate-600',
    buildUrl: buildJohnLScottUrl,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const { user, loading: authLoading } = useAuth();
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [income, setIncome] = useState<number | null>(null);
  const [monthlyDebt, setMonthlyDebt] = useState<number | null>(null);

  const [prefs, setPrefs] = useState<SearchPrefs>({
    min_price: 500000,
    max_price: 800000,
    city: 'Seattle, WA',
    min_beds: 2,
    min_baths: 1,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfileLoading(false);
      return;
    }

    const supabase = createClient();
    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('search_prefs, income, monthly_debt')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Browse: profile fetch error', error);
          return;
        }

        if (data?.search_prefs) {
          setPrefs((p) => ({ ...p, ...data.search_prefs }));
        }
        if (data?.income) setIncome(data.income);
        if (data?.monthly_debt) setMonthlyDebt(data.monthly_debt);
      } finally {
        setProfileLoading(false);
      }
    };

    fetchProfile();
  }, [user, authLoading]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ search_prefs: prefs })
      .eq('id', user.id);
    if (error) {
      toast.error('Failed to save preferences');
    } else {
      toast.success('Preferences saved!');
    }
    setSaving(false);
  };

  const affordability = calcAffordability(income, monthlyDebt);

  const getAffordabilityStatus = () => {
    if (!affordability) return null;
    const budget = prefs.max_price ?? 800000;
    const qual = affordability.conventional;
    if (budget <= qual * 0.9) return 'green';
    if (budget <= qual) return 'yellow';
    return 'red';
  };

  const afStatus = getAffordabilityStatus();

  if (profileLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Browse Listings</h1>
        <p className="text-muted-foreground">Find properties within your budget across top listing sites.</p>
      </div>

      {/* Budget settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-600" />
            Budget & Search Preferences
          </CardTitle>
          <CardDescription>
            Customize your search filters — links below will open pre-filtered results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Min Price ($)</Label>
              <Input
                type="number"
                value={prefs.min_price ?? ''}
                onChange={(e) => setPrefs({ ...prefs, min_price: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="500000"
              />
            </div>
            <div className="space-y-2">
              <Label>Max Price ($)</Label>
              <Input
                type="number"
                value={prefs.max_price ?? ''}
                onChange={(e) => setPrefs({ ...prefs, max_price: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="800000"
              />
            </div>
            <div className="space-y-2">
              <Label>City / Neighborhood</Label>
              <Input
                value={prefs.city ?? ''}
                onChange={(e) => setPrefs({ ...prefs, city: e.target.value })}
                placeholder="Seattle, WA"
              />
            </div>
            <div className="space-y-2">
              <Label>Min Bedrooms</Label>
              <Select
                value={String(prefs.min_beds ?? 2)}
                onValueChange={(v) => setPrefs({ ...prefs, min_beds: parseInt(v ?? '2') })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1+</SelectItem>
                  <SelectItem value="2">2+</SelectItem>
                  <SelectItem value="3">3+</SelectItem>
                  <SelectItem value="4">4+</SelectItem>
                  <SelectItem value="5">5+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Min Bathrooms</Label>
              <Select
                value={String(prefs.min_baths ?? 1)}
                onValueChange={(v) => setPrefs({ ...prefs, min_baths: parseFloat(v ?? '1') })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1+</SelectItem>
                  <SelectItem value="2">2+</SelectItem>
                  <SelectItem value="3">3+</SelectItem>
                  <SelectItem value="4">4+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? (
                  'Saving...'
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Preferences
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Affordability check */}
      {income && affordability && (
        <Card className={
          afStatus === 'green'
            ? 'border-green-300 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800'
            : afStatus === 'yellow'
              ? 'border-yellow-300 bg-yellow-50/50 dark:bg-yellow-950/20 dark:border-yellow-800'
              : 'border-red-300 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800'
        }>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className={`h-5 w-5 ${
                afStatus === 'green' ? 'text-green-600' : afStatus === 'yellow' ? 'text-yellow-600' : 'text-red-600'
              }`} />
              Affordability Check
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              At your income of <span className="font-semibold text-foreground">{formatCurrency(income)}</span>, you qualify for approximately:
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-lg border p-3 bg-background">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">FHA Loan (~3.5% down)</p>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(affordability.fha)}</p>
                <p className="text-xs text-muted-foreground mt-1">Max purchase price</p>
              </div>
              <div className="rounded-lg border p-3 bg-background">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Conventional (~5% down)</p>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(affordability.conventional)}</p>
                <p className="text-xs text-muted-foreground mt-1">Max purchase price</p>
              </div>
            </div>
            <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
              afStatus === 'green'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                : afStatus === 'yellow'
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
            }`}>
              {afStatus === 'green' ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span>
                {afStatus === 'green'
                  ? `Your max budget of ${formatCurrency(prefs.max_price ?? 0)} is well within your qualification range. You're in good shape!`
                  : afStatus === 'yellow'
                    ? `Your max budget of ${formatCurrency(prefs.max_price ?? 0)} is close to your qualification limit. Consider getting pre-approved.`
                    : `Your max budget of ${formatCurrency(prefs.max_price ?? 0)} exceeds your estimated qualification of ${formatCurrency(affordability.conventional)}. You may need a co-borrower or larger down payment.`
                }
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              * Based on 43% DTI ratio. Actual qualification depends on credit score, debts, and lender criteria.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Platform deep links */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Open in Listing Sites</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLATFORMS.map((platform) => {
            const url = platform.buildUrl(prefs);
            return (
              <Card key={platform.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl" role="img" aria-label={platform.name}>{platform.emoji}</span>
                      <div>
                        <p className="font-semibold">{platform.name}</p>
                        <p className="text-xs text-muted-foreground">Active listings</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${platform.color}`}>
                      For Sale
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mb-3 space-y-0.5">
                    <div>{formatCurrency(prefs.min_price ?? 500000)} – {formatCurrency(prefs.max_price ?? 800000)}</div>
                    <div>{prefs.min_beds ?? 2}+ beds · {prefs.min_baths ?? 1}+ baths</div>
                    <div>{prefs.city ?? 'Seattle, WA'}</div>
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in {platform.name}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
