'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Save, CheckCircle2, DollarSign, TrendingUp, AlertTriangle, Search, Home, Bed, Bath, Square, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
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

function calcAffordability(income: number | null, monthlyDebt: number | null) {
  if (!income) return null;
  const monthlyIncome = income / 12;
  const existingDebt = monthlyDebt ?? 0;
  const maxHousingPayment = monthlyIncome * 0.43 - existingDebt;
  if (maxHousingPayment <= 0) return null;

  const fhaRate = 0.0675 / 12;
  const fhaN = 360;
  const fhaPaymentFactor = (fhaRate * Math.pow(1 + fhaRate, fhaN)) / (Math.pow(1 + fhaRate, fhaN) - 1);
  const fhaMipFactor = 0.0055 / 12;
  const fhaMaxLoan = maxHousingPayment / (fhaPaymentFactor + fhaMipFactor);
  const fhaMaxPrice = Math.round(fhaMaxLoan / 0.965);

  const convRate = 0.07 / 12;
  const convN = 360;
  const convPaymentFactor = (convRate * Math.pow(1 + convRate, convN)) / (Math.pow(1 + convRate, convN) - 1);
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

// ── Listing types ─────────────────────────────────────────────────────────────

interface Listing {
  id: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  price?: number;
  squareFootage?: number;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
  daysOnMarket?: number;
  photoUrl?: string;
  status?: string;
  listedDate?: string;
  latitude?: number;
  longitude?: number;
}

interface ListingsResponse {
  listings: Listing[];
  page: number;
  limit: number;
  callsUsed: number;
  callsRemaining: number;
  cached: boolean;
}

interface QuotaExceededResponse {
  error: string;
  callsUsed: number;
  limit: number;
  resetsAt: string;
}

// ── Listing Card ──────────────────────────────────────────────────────────────

function ListingCard({ listing, onSave }: { listing: Listing; onSave: (l: Listing) => Promise<void> }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(listing);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const pricePerSqft = listing.price && listing.squareFootage
    ? Math.round(listing.price / listing.squareFootage)
    : null;

  const address = listing.formattedAddress ?? listing.addressLine1 ?? 'Unknown Address';

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      {/* Photo */}
      <div className="relative h-44 bg-muted">
        {listing.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.photoUrl}
            alt={address}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Home className="h-12 w-12 opacity-30" />
          </div>
        )}
        {listing.daysOnMarket !== undefined && (
          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {listing.daysOnMarket}d
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        {/* Price */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-xl font-bold text-blue-600">
            {listing.price ? formatCurrency(listing.price) : 'Price N/A'}
          </p>
          {listing.propertyType && (
            <Badge variant="secondary" className="text-xs shrink-0">
              {listing.propertyType}
            </Badge>
          )}
        </div>

        {/* Address */}
        <p className="text-sm font-medium leading-snug">{address}</p>

        {/* Stats */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {listing.bedrooms !== undefined && (
            <span className="flex items-center gap-1">
              <Bed className="h-3 w-3" /> {listing.bedrooms} bd
            </span>
          )}
          {listing.bathrooms !== undefined && (
            <span className="flex items-center gap-1">
              <Bath className="h-3 w-3" /> {listing.bathrooms} ba
            </span>
          )}
          {listing.squareFootage && (
            <span className="flex items-center gap-1">
              <Square className="h-3 w-3" /> {listing.squareFootage.toLocaleString()} sqft
            </span>
          )}
          {pricePerSqft && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> {pricePerSqft}/sqft
            </span>
          )}
        </div>

        {/* Save button */}
        <Button
          size="sm"
          variant={saved ? 'secondary' : 'default'}
          className="w-full"
          onClick={handleSave}
          disabled={saving || saved}
        >
          {saved ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Saved ✓
            </>
          ) : saving ? (
            'Saving...'
          ) : (
            <>
              <Save className="h-3.5 w-3.5 mr-1.5" /> Save Property
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function ListingSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-44 w-full rounded-none" />
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}

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

  // Live listings state
  const [listingsCity, setListingsCity] = useState('Seattle');
  const [listingsState, setListingsState] = useState('WA');
  const [listingsMinPrice, setListingsMinPrice] = useState('500000');
  const [listingsMaxPrice, setListingsMaxPrice] = useState('900000');
  const [listingsMinBeds, setListingsMinBeds] = useState('2');
  const [listingsPage, setListingsPage] = useState(1);
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [callsUsed, setCallsUsed] = useState<number | null>(null);
  const [callsRemaining, setCallsRemaining] = useState<number | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState<QuotaExceededResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

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

  const handleSavePrefs = async () => {
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

  const fetchListings = useCallback(async (page: number) => {
    if (!user) return;
    setListingsLoading(true);
    setQuotaExceeded(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      const params = new URLSearchParams({
        city: listingsCity,
        state: listingsState,
        minPrice: listingsMinPrice,
        maxPrice: listingsMaxPrice,
        minBeds: listingsMinBeds,
        page: String(page),
      });

      const res = await fetch(`/api/listings?${params}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (res.status === 429) {
        const data: QuotaExceededResponse = await res.json();
        setQuotaExceeded(data);
        setListings(null);
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? 'Failed to fetch listings');
        return;
      }

      const data: ListingsResponse = await res.json();
      setListings(data.listings);
      setCallsUsed(data.callsUsed);
      setCallsRemaining(data.callsRemaining);
      setListingsPage(page);
      setHasSearched(true);
    } finally {
      setListingsLoading(false);
    }
  }, [user, listingsCity, listingsState, listingsMinPrice, listingsMaxPrice, listingsMinBeds]);

  const handleSearch = () => {
    fetchListings(1);
  };

  const handleSaveProperty = async (listing: Listing) => {
    if (!user) return;
    const supabase = createClient();
    const { error } = await supabase.from('properties').insert({
      user_id: user.id,
      address: listing.formattedAddress ?? listing.addressLine1 ?? '',
      city: listing.city ?? listingsCity,
      state: listing.state ?? listingsState,
      zip: listing.zipCode ?? '',
      price: listing.price ?? 0,
      sqft: listing.squareFootage ?? null,
      bedrooms: listing.bedrooms ?? null,
      bathrooms: listing.bathrooms ?? null,
    });

    if (error) {
      toast.error('Failed to save property');
      throw error;
    }
    toast.success('Saved!');
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

  // Reset month display
  const now = new Date();
  const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const resetStr = resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

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

      {/* ── Live Listings Section ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="h-5 w-5 text-blue-600" />
                Live Listings
              </CardTitle>
              <CardDescription>Real listings pulled directly from Rentcast MLS data.</CardDescription>
            </div>
            {/* Usage badge */}
            <div className="shrink-0">
              <Badge
                variant={callsUsed !== null && callsUsed >= 2 ? 'destructive' : 'secondary'}
                className="text-xs whitespace-nowrap"
              >
                {callsUsed ?? 0}/2 API calls used this month (resets {resetStr})
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter bar */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">City</Label>
              <Input
                value={listingsCity}
                onChange={(e) => setListingsCity(e.target.value)}
                placeholder="Seattle"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State</Label>
              <Input
                value={listingsState}
                onChange={(e) => setListingsState(e.target.value)}
                placeholder="WA"
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Min Price ($)</Label>
              <Input
                type="number"
                value={listingsMinPrice}
                onChange={(e) => setListingsMinPrice(e.target.value)}
                placeholder="500000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max Price ($)</Label>
              <Input
                type="number"
                value={listingsMaxPrice}
                onChange={(e) => setListingsMaxPrice(e.target.value)}
                placeholder="900000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Min Beds</Label>
              <Select value={listingsMinBeds} onValueChange={(v) => v && setListingsMinBeds(v)}>
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
            <Button onClick={handleSearch} disabled={listingsLoading} className="w-full">
              {listingsLoading ? (
                'Searching...'
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>

          {/* Quota exceeded state */}
          {quotaExceeded && (
            <div className="rounded-lg border border-red-300 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800 p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <p className="font-semibold">Monthly quota reached</p>
              </div>
              <p className="text-sm text-muted-foreground">
                You&apos;ve used your 2 free API calls for this month. Your quota resets on{' '}
                <span className="font-medium">
                  {new Date(quotaExceeded.resetsAt).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                .
              </p>
              <p className="text-xs text-muted-foreground">
                Tip: Cached results from previous searches don&apos;t count toward your quota!
              </p>
            </div>
          )}

          {/* Loading skeleton */}
          {listingsLoading && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <ListingSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Results grid */}
          {!listingsLoading && listings !== null && (
            <>
              {listings.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Home className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No listings found</p>
                  <p className="text-sm">Try adjusting your filters or searching a different area.</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {listings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} onSave={handleSaveProperty} />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {listings.length > 0 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchListings(listingsPage - 1)}
                    disabled={listingsPage <= 1 || listingsLoading}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">Page {listingsPage}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchListings(listingsPage + 1)}
                    disabled={listings.length < 10 || listingsLoading || (callsRemaining !== null && callsRemaining <= 0)}
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}

              {listings.length > 0 && (
                <p className="text-xs text-center text-muted-foreground">
                  Each page = 1 API call · Cached results are free
                </p>
              )}
            </>
          )}

          {/* Initial empty state (before first search) */}
          {!listingsLoading && !hasSearched && !quotaExceeded && (
            <div className="text-center py-10 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Set your filters above and click Search to load live listings.</p>
            </div>
          )}
        </CardContent>
      </Card>

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
              <Button onClick={handleSavePrefs} disabled={saving} className="w-full">
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
