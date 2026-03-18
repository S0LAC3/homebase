import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const RENTCAST_API_KEY = process.env.RENTCAST_API_KEY ?? '994b9e19839b4f838c8509156ff056c9';
const MONTHLY_LIMIT = 2;

interface RentcastListing {
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city') ?? 'Seattle';
  const state = searchParams.get('state') ?? 'WA';
  const minPrice = searchParams.get('minPrice') ?? '500000';
  const maxPrice = searchParams.get('maxPrice') ?? '900000';
  const minBeds = searchParams.get('minBeds') ?? '2';
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = 10;
  const offset = (page - 1) * limit;

  // Authenticate user via Bearer token
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );

  // Verify JWT and get user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = user.id;

  // Use service role client for DB operations (bypass RLS for cache/usage tables)
  const serviceSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );

  // Check cache first
  const cacheKey = `listings:${city}:${state}:${minPrice}:${maxPrice}:${minBeds}:${page}`;
  const now = new Date();

  const { data: cached } = await serviceSupabase
    .from('listings_cache')
    .select('data, expires_at')
    .eq('cache_key', cacheKey)
    .single();

  if (cached && new Date(cached.expires_at) > now) {
    // Check current usage for badge info (no increment)
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { data: usage } = await serviceSupabase
      .from('api_usage')
      .select('calls_used')
      .eq('user_id', userId)
      .eq('api_name', 'rentcast')
      .eq('month', currentMonth)
      .single();

    const callsUsed = usage?.calls_used ?? 0;

    return NextResponse.json({
      listings: (cached.data as { listings: RentcastListing[] }).listings,
      page,
      limit,
      callsUsed,
      callsRemaining: Math.max(0, MONTHLY_LIMIT - callsUsed),
      cached: true,
    });
  }

  // Not cached — check quota
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: usage } = await serviceSupabase
    .from('api_usage')
    .select('calls_used')
    .eq('user_id', userId)
    .eq('api_name', 'rentcast')
    .eq('month', currentMonth)
    .single();

  const callsUsed = usage?.calls_used ?? 0;

  if (callsUsed >= MONTHLY_LIMIT) {
    // Calculate reset date: first day of next month
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return NextResponse.json(
      {
        error: 'Monthly quota exceeded. Upgrade for more searches.',
        callsUsed: MONTHLY_LIMIT,
        limit: MONTHLY_LIMIT,
        resetsAt: nextMonth.toISOString(),
      },
      { status: 429 }
    );
  }

  // Call Rentcast API
  const rentcastUrl = new URL('https://api.rentcast.io/v1/listings/sale');
  rentcastUrl.searchParams.set('city', city);
  rentcastUrl.searchParams.set('state', state);
  rentcastUrl.searchParams.set('status', 'Active');
  if (minPrice) rentcastUrl.searchParams.set('minPrice', minPrice);
  if (maxPrice) rentcastUrl.searchParams.set('maxPrice', maxPrice);
  if (minBeds) rentcastUrl.searchParams.set('minBedrooms', minBeds);
  rentcastUrl.searchParams.set('limit', String(limit));
  rentcastUrl.searchParams.set('offset', String(offset));

  let listings: RentcastListing[] = [];

  try {
    const rentcastRes = await fetch(rentcastUrl.toString(), {
      headers: {
        'X-Api-Key': RENTCAST_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!rentcastRes.ok) {
      const errText = await rentcastRes.text();
      console.error('Rentcast API error:', rentcastRes.status, errText);
      return NextResponse.json(
        { error: `Rentcast API error: ${rentcastRes.status}` },
        { status: 502 }
      );
    }

    const rentcastData = await rentcastRes.json();
    // Rentcast returns an array directly or { data: [] }
    listings = Array.isArray(rentcastData) ? rentcastData : (rentcastData.data ?? []);
  } catch (err) {
    console.error('Rentcast fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch from Rentcast' }, { status: 502 });
  }

  // Cache the result (24h)
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  await serviceSupabase
    .from('listings_cache')
    .upsert(
      { cache_key: cacheKey, data: { listings }, expires_at: expiresAt },
      { onConflict: 'cache_key' }
    );

  // Increment usage counter
  if (callsUsed === 0) {
    await serviceSupabase.from('api_usage').insert({
      user_id: userId,
      api_name: 'rentcast',
      month: currentMonth,
      calls_used: 1,
    });
  } else {
    await serviceSupabase
      .from('api_usage')
      .update({ calls_used: callsUsed + 1 })
      .eq('user_id', userId)
      .eq('api_name', 'rentcast')
      .eq('month', currentMonth);
  }

  const newCallsUsed = callsUsed + 1;

  return NextResponse.json({
    listings,
    page,
    limit,
    callsUsed: newCallsUsed,
    callsRemaining: Math.max(0, MONTHLY_LIMIT - newCallsUsed),
    cached: false,
  });
}
