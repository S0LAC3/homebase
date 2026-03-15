'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Home, DollarSign, MapPin, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/mortgage';

const steps = [
  { title: 'Welcome', icon: Home },
  { title: 'Financial Profile', icon: DollarSign },
  { title: 'Location', icon: MapPin },
];

export default function OnboardPage() {
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    income: '',
    credit_score: '',
    monthly_debt: '',
    savings: '',
    target_location: 'Seattle, WA',
  });

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSaving(true);

    const supabase = createClient();

    // Upsert profile
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      name: form.name || user.user_metadata?.full_name || null,
      role: 'buyer',
      income: form.income ? parseFloat(form.income) : null,
      credit_score: form.credit_score ? parseInt(form.credit_score) : null,
      monthly_debt: form.monthly_debt ? parseFloat(form.monthly_debt) : null,
      savings: form.savings ? parseFloat(form.savings) : null,
      target_location: form.target_location || 'Seattle, WA',
    });

    if (error) {
      toast.error('Failed to save profile');
      setSaving(false);
      return;
    }

    // Create default checklist items
    const checklistItems = DEFAULT_CHECKLIST_ITEMS.map((item) => ({
      user_id: user.id,
      title: item.title,
      description: item.description,
      status: 'pending',
      sort_order: item.sort_order,
    }));

    await supabase.from('checklist_items').insert(checklistItems);

    await refreshProfile();
    toast.success('Profile saved! Welcome to HomeBase.');
    router.push('/dashboard');
  };

  return (
    <div className="max-w-lg mx-auto py-8">
      <Progress value={((step + 1) / steps.length) * 100} className="mb-8" />

      {step === 0 && (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto rounded-full bg-blue-50 p-4 w-fit mb-4">
              <Home className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Welcome to HomeBase</CardTitle>
            <CardDescription>
              Let&apos;s set up your profile so we can help you find the right home. This takes about 2 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                placeholder="Jane Doe"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={() => setStep(1)}>
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Financial Profile</CardTitle>
            <CardDescription>
              This helps us estimate what you can afford. All fields are optional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="income">Annual gross income ($)</Label>
              <Input
                id="income"
                type="number"
                placeholder="85000"
                value={form.income}
                onChange={(e) => update('income', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credit">Credit score</Label>
              <Input
                id="credit"
                type="number"
                placeholder="720"
                min={300}
                max={850}
                value={form.credit_score}
                onChange={(e) => update('credit_score', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="debt">Monthly debt payments ($)</Label>
              <Input
                id="debt"
                type="number"
                placeholder="500"
                value={form.monthly_debt}
                onChange={(e) => update('monthly_debt', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Include car loans, student loans, minimum credit card payments, etc.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="savings">Total savings ($)</Label>
              <Input
                id="savings"
                type="number"
                placeholder="50000"
                value={form.savings}
                onChange={(e) => update('savings', e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1" onClick={() => setStep(2)}>
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Where are you looking?</CardTitle>
            <CardDescription>
              We&apos;ll pre-load local data like FHA loan limits and property tax rates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="location">Target location</Label>
              <Input
                id="location"
                placeholder="Seattle, WA"
                value={form.target_location}
                onChange={(e) => update('target_location', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                HomeBase is optimized for King County, WA with pre-loaded FHA limits and tax rates.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving...' : 'Complete Setup'}
                <Check className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
