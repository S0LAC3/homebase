'use client';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Home,
  Calculator,
  Wallet,
  CheckSquare,
  Building2,
  ArrowRight,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';

const features = [
  {
    icon: Building2,
    title: 'Property Tracker',
    description: 'Save and compare properties with detailed analysis and notes.',
  },
  {
    icon: Calculator,
    title: 'Mortgage Calculator',
    description: 'Compare FHA, Conventional, and VA loans with King County limits built in.',
  },
  {
    icon: Wallet,
    title: 'Budget Planner',
    description: 'Track income and expenses to see how a mortgage fits your finances.',
  },
  {
    icon: CheckSquare,
    title: 'Buying Checklist',
    description: 'Stay on track from pre-approval to closing with a step-by-step checklist.',
  },
  {
    icon: Shield,
    title: 'Advisor Access',
    description: 'Invite your loan officer or agent for read-only access to your data.',
  },
  {
    icon: Home,
    title: 'Seattle Focus',
    description: 'Pre-loaded with King County FHA limits, tax rates, and WA first-time buyer programs.',
  },
];

export default function LandingPage() {
  const { user } = useAuth();

  const handleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home className="h-6 w-6 text-blue-600" />
          <span className="font-bold text-xl">HomeBase</span>
        </div>
        {user ? (
          <Button>
            <Link href="/dashboard">
              Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button onClick={handleSignIn}>Sign in with Google</Button>
        )}
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-slate-900">
            Your homebuying journey,{' '}
            <span className="text-blue-600">organized</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
            Track properties, compare mortgage options, manage your budget, and stay on top of
            every step — all in one place. Built with Seattle-area homebuyers in mind.
          </p>
          <div className="flex gap-4 justify-center">
            {user ? (
              <Button size="lg">
                <Link href="/dashboard">
                  Open Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button size="lg" onClick={handleSignIn}>
                Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
          Everything you need to buy a home
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="border-slate-200">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="rounded-lg bg-blue-50 p-2">
                      <Icon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-16 text-center">
        <Card className="max-w-2xl mx-auto bg-blue-600 text-white border-0">
          <CardContent className="py-12 space-y-4">
            <h2 className="text-2xl font-bold">Ready to start your homebuying journey?</h2>
            <p className="text-blue-100">
              Free to use. No credit card required. Built for first-time homebuyers.
            </p>
            {user ? (
              <Button size="lg" variant="secondary">
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            ) : (
              <Button size="lg" variant="secondary" onClick={handleSignIn}>
                Sign in with Google
              </Button>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 mt-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} HomeBase. Built for Seattle-area homebuyers.</p>
          <p className="mt-2">
            Check out{' '}
            <a
              href="https://www.wshfc.org/buyers/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Washington State Housing Finance Commission
            </a>{' '}
            programs for first-time homebuyer assistance.
          </p>
        </div>
      </footer>
    </div>
  );
}
