'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Settings, User, Shield, Trash2, UserPlus, Mail } from 'lucide-react';
import { toast } from 'sonner';
import type { Profile, AdvisorAccess } from '@/types';

interface AdvisorAccessWithProfile extends AdvisorAccess {
  advisor: { name: string | null; email: string } | null;
}

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [advisors, setAdvisors] = useState<AdvisorAccessWithProfile[]>([]);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: '',
    income: '',
    credit_score: '',
    monthly_debt: '',
    savings: '',
    target_location: '',
  });

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name ?? '',
        income: profile.income?.toString() ?? '',
        credit_score: profile.credit_score?.toString() ?? '',
        monthly_debt: profile.monthly_debt?.toString() ?? '',
        savings: profile.savings?.toString() ?? '',
        target_location: profile.target_location ?? '',
      });
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from('advisor_access')
      .select('*, advisor:advisor_id(name, email)')
      .eq('buyer_id', user.id)
      .then(({ data }) => {
        setAdvisors((data as AdvisorAccessWithProfile[] | null) ?? []);
        setLoading(false);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      name: form.name || null,
      income: form.income ? parseFloat(form.income) : null,
      credit_score: form.credit_score ? parseInt(form.credit_score) : null,
      monthly_debt: form.monthly_debt ? parseFloat(form.monthly_debt) : null,
      savings: form.savings ? parseFloat(form.savings) : null,
      target_location: form.target_location || null,
    });

    if (error) {
      toast.error('Failed to save profile');
    } else {
      await refreshProfile();
      toast.success('Profile updated!');
    }
    setSaving(false);
  };

  const handleInviteAdvisor = async () => {
    if (!user || !inviteEmail) {
      toast.error('Email is required');
      return;
    }
    const supabase = createClient();

    // Find advisor by email
    const { data: advisorProfile } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('email', inviteEmail)
      .eq('role', 'advisor')
      .single();

    if (!advisorProfile) {
      toast.error('No advisor found with that email. They need to sign up first.');
      return;
    }

    // Check if already granted
    const existing = advisors.find((a) => a.advisor_id === advisorProfile.id);
    if (existing) {
      toast.error('This advisor already has access');
      return;
    }

    const { data, error } = await supabase
      .from('advisor_access')
      .insert({
        buyer_id: user.id,
        advisor_id: advisorProfile.id,
      })
      .select('*, advisor:advisor_id(name, email)')
      .single();

    if (error) {
      toast.error('Failed to grant access');
    } else if (data) {
      setAdvisors([...advisors, data as AdvisorAccessWithProfile]);
      toast.success('Advisor access granted!');
      setInviteDialogOpen(false);
      setInviteEmail('');
    }
  };

  const handleRevokeAdvisor = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('advisor_access').delete().eq('id', id);
    if (error) {
      toast.error('Failed to revoke access');
    } else {
      setAdvisors(advisors.filter((a) => a.id !== id));
      toast.success('Advisor access revoked');
    }
  };

  if (loading && !profile) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your profile and advisor access.</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" /> Profile
          </CardTitle>
          <CardDescription>
            Your financial info helps generate accurate mortgage estimates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ''} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Annual Income ($)</Label>
              <Input
                type="number"
                value={form.income}
                onChange={(e) => setForm({ ...form, income: e.target.value })}
                placeholder="85000"
              />
            </div>
            <div className="space-y-2">
              <Label>Credit Score</Label>
              <Input
                type="number"
                value={form.credit_score}
                onChange={(e) => setForm({ ...form, credit_score: e.target.value })}
                placeholder="720"
                min={300}
                max={850}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Monthly Debt ($)</Label>
              <Input
                type="number"
                value={form.monthly_debt}
                onChange={(e) => setForm({ ...form, monthly_debt: e.target.value })}
                placeholder="500"
              />
            </div>
            <div className="space-y-2">
              <Label>Total Savings ($)</Label>
              <Input
                type="number"
                value={form.savings}
                onChange={(e) => setForm({ ...form, savings: e.target.value })}
                placeholder="50000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Target Location</Label>
            <Input
              value={form.target_location}
              onChange={(e) => setForm({ ...form, target_location: e.target.value })}
              placeholder="Seattle, WA"
            />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      {/* Advisor Access */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" /> Advisor Access
              </CardTitle>
              <CardDescription>
                Grant your loan officer or agent read-only access to your data.
              </CardDescription>
            </div>
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="mr-2 h-4 w-4" /> Invite
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Advisor</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Enter the email of your loan officer or real estate agent. They must have a
                    HomeBase account with the &quot;advisor&quot; role.
                  </p>
                  <div className="space-y-2">
                    <Label>Advisor Email</Label>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="advisor@example.com"
                    />
                  </div>
                  <Button onClick={handleInviteAdvisor} className="w-full">
                    Grant Access
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {advisors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No advisors have access to your data. Invite your loan officer or agent to give
              them read-only access.
            </p>
          ) : (
            <div className="space-y-3">
              {advisors.map((access) => (
                <div key={access.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <p className="font-medium">{access.advisor?.name ?? 'Advisor'}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {access.advisor?.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Read-only</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => handleRevokeAdvisor(access.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
