'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Settings, User, Shield, Trash2, UserPlus, Mail, Bell, TrendingDown, TrendingUp, Activity } from 'lucide-react';
import { toast } from 'sonner';
import type { Profile, AdvisorAccess } from '@/types';

// ─── Rate Alert Types ────────────────────────────────────────────────────────

type AlertWhen = 'drops_below' | 'rises_above' | 'any_change';
type LoanType = 'FHA' | 'Conventional' | 'VA';

interface RateAlert {
  id: string;
  user_id: string;
  alert_when: AlertWhen;
  threshold_rate: number | null;
  loan_type: LoanType;
  is_active: boolean;
  created_at: string;
}

interface MortgageRateRow {
  rate_date: string;
  rate_30yr_fixed: number;
  rate_15yr_fixed: number | null;
  rate_fha: number | null;
}

// ─── Rate Alerts Section Component ──────────────────────────────────────────

function RateAlertsSection({ userId }: { userId: string }) {
  const [alerts, setAlerts] = useState<RateAlert[]>([]);
  const [currentRates, setCurrentRates] = useState<MortgageRateRow | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  // Form state
  const [alertWhen, setAlertWhen] = useState<AlertWhen>('drops_below');
  const [loanType, setLoanType] = useState<LoanType>('FHA');
  const [thresholdRate, setThresholdRate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const fetchData = async () => {
      const [alertsRes, ratesRes] = await Promise.all([
        supabase
          .from('rate_alerts')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('mortgage_rates')
          .select('rate_date, rate_30yr_fixed, rate_15yr_fixed, rate_fha')
          .order('rate_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (alertsRes.data) setAlerts(alertsRes.data as RateAlert[]);
      if (ratesRes.data) setCurrentRates(ratesRes.data as MortgageRateRow);
      setLoadingAlerts(false);
    };
    fetchData();
  }, [userId]);

  const handleAddAlert = async () => {
    if (alertWhen !== 'any_change' && !thresholdRate) {
      toast.error('Please enter a threshold rate');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('rate_alerts')
      .insert({
        user_id: userId,
        alert_when: alertWhen,
        threshold_rate: alertWhen !== 'any_change' ? parseFloat(thresholdRate) : null,
        loan_type: loanType,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create alert');
    } else if (data) {
      setAlerts([data as RateAlert, ...alerts]);
      toast.success('Rate alert created!');
      setThresholdRate('');
      setAlertWhen('drops_below');
      setLoanType('FHA');
    }
    setSaving(false);
  };

  const handleToggleAlert = async (alert: RateAlert) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('rate_alerts')
      .update({ is_active: !alert.is_active })
      .eq('id', alert.id);
    if (error) {
      toast.error('Failed to update alert');
    } else {
      setAlerts(alerts.map((a) => (a.id === alert.id ? { ...a, is_active: !a.is_active } : a)));
    }
  };

  const handleDeleteAlert = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('rate_alerts').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete alert');
    } else {
      setAlerts(alerts.filter((a) => a.id !== id));
      toast.success('Alert deleted');
    }
  };

  const alertWhenLabel = (when: AlertWhen) => {
    if (when === 'drops_below') return 'Drops below';
    if (when === 'rises_above') return 'Rises above';
    return 'Any change';
  };

  const AlertIcon = ({ when }: { when: AlertWhen }) => {
    if (when === 'drops_below') return <TrendingDown className="h-4 w-4 text-green-600" />;
    if (when === 'rises_above') return <TrendingUp className="h-4 w-4 text-red-500" />;
    return <Activity className="h-4 w-4 text-blue-500" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" /> Rate Alerts
        </CardTitle>
        <CardDescription>
          Get notified when mortgage rates hit your targets. Rates update every Monday from FRED.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Rates Display */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Current Rates
            {currentRates && (
              <span className="ml-2 normal-case font-normal">
                — as of {new Date(currentRates.rate_date + 'T00:00:00').toLocaleDateString()}
              </span>
            )}
          </p>
          {!currentRates ? (
            <p className="text-sm text-muted-foreground">
              No rate data yet. Rates will appear after the first weekly update.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">30yr Fixed</p>
                <p className="text-xl font-bold">{currentRates.rate_30yr_fixed.toFixed(2)}%</p>
              </div>
              {currentRates.rate_fha != null && (
                <div>
                  <p className="text-xs text-muted-foreground">FHA</p>
                  <p className="text-xl font-bold">{currentRates.rate_fha.toFixed(2)}%</p>
                </div>
              )}
              {currentRates.rate_15yr_fixed != null && (
                <div>
                  <p className="text-xs text-muted-foreground">15yr Fixed</p>
                  <p className="text-xl font-bold">{currentRates.rate_15yr_fixed.toFixed(2)}%</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add Alert Form */}
        <div className="space-y-4">
          <p className="text-sm font-medium">Add New Alert</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Loan Type</Label>
              <Select value={loanType} onValueChange={(v) => setLoanType(v as LoanType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FHA">FHA</SelectItem>
                  <SelectItem value="Conventional">Conventional</SelectItem>
                  <SelectItem value="VA">VA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Alert When</Label>
              <Select value={alertWhen} onValueChange={(v) => setAlertWhen(v as AlertWhen)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="drops_below">Drops Below</SelectItem>
                  <SelectItem value="rises_above">Rises Above</SelectItem>
                  <SelectItem value="any_change">Any Change</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {alertWhen !== 'any_change' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Rate (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="h-9"
                  value={thresholdRate}
                  onChange={(e) => setThresholdRate(e.target.value)}
                  placeholder="6.50"
                />
              </div>
            )}
            <div className="flex items-end">
              <Button
                onClick={handleAddAlert}
                disabled={saving}
                size="sm"
                className="h-9 w-full"
              >
                {saving ? 'Adding...' : 'Add Alert'}
              </Button>
            </div>
          </div>
        </div>

        {/* Existing Alerts */}
        {loadingAlerts ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No alerts set. Add one above to get notified when rates change.
          </p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-3 border rounded-md"
              >
                <div className="flex items-center gap-3">
                  <AlertIcon when={alert.alert_when} />
                  <div>
                    <p className="text-sm font-medium">
                      {alert.loan_type} — {alertWhenLabel(alert.alert_when)}
                      {alert.threshold_rate != null && ` ${alert.threshold_rate}%`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(alert.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={alert.is_active}
                    onCheckedChange={() => handleToggleAlert(alert)}
                    aria-label="Toggle alert"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-700"
                    onClick={() => handleDeleteAlert(alert.id)}
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
  );
}

interface AdvisorAccessWithProfile extends AdvisorAccess {
  advisor: { name: string | null; email: string } | null;
}

export default function SettingsPage() {
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();
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
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const fetchData = async () => {
      try {
        const { data } = await supabase
          .from('advisor_access')
          .select('*, advisor:advisor_id(name, email)')
          .eq('buyer_id', user.id);
        setAdvisors((data as AdvisorAccessWithProfile[] | null) ?? []);
      } catch (error) {
        console.error('Settings: failed to fetch advisors', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, authLoading]);

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

      {/* Rate Alerts */}
      {user && <RateAlertsSection userId={user.id} />}

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
              <DialogTrigger>
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
