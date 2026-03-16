'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types';

interface BuyerInfo {
  id: string;
  name: string | null;
  email: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  /** The user_id to use for all data queries (buyer's own id, or linked buyer for advisors) */
  activeBuyerId: string | null;
  /** Whether the current user is an advisor viewing a buyer's data */
  isAdvisor: boolean;
  /** Name of the buyer being viewed (for advisor banner) */
  activeBuyerName: string | null;
  /** All buyers linked to this advisor */
  linkedBuyers: BuyerInfo[];
  /** Switch which buyer the advisor is viewing */
  setActiveBuyerId: (id: string) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  activeBuyerId: null,
  isAdvisor: false,
  activeBuyerName: null,
  linkedBuyers: [],
  setActiveBuyerId: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedBuyers, setLinkedBuyers] = useState<BuyerInfo[]>([]);
  const [activeBuyerIdState, setActiveBuyerIdState] = useState<string | null>(null);
  const supabase = createClient();

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('Auth: profile fetch error', error.code, error.message);
    }
    setProfile(data);
    return data as Profile | null;
  };

  const fetchLinkedBuyers = async (advisorId: string) => {
    const { data, error } = await supabase
      .from('advisor_access')
      .select('buyer_id, buyer:buyer_id(id, name, email)')
      .eq('advisor_id', advisorId);

    if (error) {
      console.error('Auth: advisor_access fetch error', error.code, error.message);
      return [];
    }

    const buyers: BuyerInfo[] = (data ?? [])
      .map((row: Record<string, unknown>) => {
        const buyer = row.buyer as { id: string; name: string | null; email: string } | null;
        return buyer ? { id: buyer.id, name: buyer.name, email: buyer.email } : null;
      })
      .filter((b: BuyerInfo | null): b is BuyerInfo => b !== null);

    return buyers;
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    // Use onAuthStateChange as the single source of truth.
    // INITIAL_SESSION fires immediately with the current session (or null).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          try {
            const prof = await fetchProfile(currentUser.id);
            if (prof?.role === 'advisor') {
              const buyers = await fetchLinkedBuyers(currentUser.id);
              setLinkedBuyers(buyers);
              if (buyers.length > 0) {
                setActiveBuyerIdState((prev) => prev ?? buyers[0].id);
              }
            } else {
              setLinkedBuyers([]);
              setActiveBuyerIdState(null);
            }
          } catch (error) {
            console.error('Auth: failed to fetch profile', error);
          }
        } else {
          setProfile(null);
          setLinkedBuyers([]);
          setActiveBuyerIdState(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdvisor = profile?.role === 'advisor';
  const activeBuyerId = isAdvisor ? activeBuyerIdState : user?.id ?? null;
  const activeBuyerName = isAdvisor
    ? linkedBuyers.find((b) => b.id === activeBuyerIdState)?.name ?? null
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        refreshProfile,
        activeBuyerId,
        isAdvisor,
        activeBuyerName,
        linkedBuyers,
        setActiveBuyerId: setActiveBuyerIdState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
