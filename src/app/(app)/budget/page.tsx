'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
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
import { Plus, Trash2, Wallet, TrendingUp, TrendingDown, Home } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/mortgage';
import type { BudgetItem, MortgageScenario } from '@/types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const EXPENSE_CATEGORIES = [
  'Housing',
  'Transportation',
  'Food',
  'Insurance',
  'Healthcare',
  'Debt Payments',
  'Entertainment',
  'Savings',
  'Utilities',
  'Other',
];

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

export default function BudgetPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [scenarios, setScenarios] = useState<MortgageScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    category: 'Other',
    description: '',
    amount: '',
    is_income: false,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const fetchData = async () => {
      try {
        const [budgetRes, scenRes] = await Promise.all([
          supabase.from('budget_items').select('*').eq('user_id', user.id).order('created_at'),
          supabase.from('mortgage_scenarios').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
        ]);
        setItems(budgetRes.data ?? []);
        setScenarios(scenRes.data ?? []);
      } catch (error) {
        console.error('Budget: failed to fetch data', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, authLoading]);

  const handleAdd = async () => {
    if (!user || !form.amount || !form.description) {
      toast.error('Description and amount are required');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('budget_items')
      .insert({
        user_id: user.id,
        category: form.is_income ? 'Income' : form.category,
        description: form.description,
        amount: parseFloat(form.amount),
        is_income: form.is_income,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add item');
    } else if (data) {
      setItems([...items, data]);
      toast.success('Budget item added');
      setDialogOpen(false);
      setForm({ category: 'Other', description: '', amount: '', is_income: false });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('budget_items').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
    } else {
      setItems(items.filter((i) => i.id !== id));
      toast.success('Item removed');
    }
  };

  const incomeItems = items.filter((i) => i.is_income);
  const expenseItems = items.filter((i) => !i.is_income);
  const totalIncome = incomeItems.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = expenseItems.reduce((s, i) => s + i.amount, 0);
  const remaining = totalIncome - totalExpenses;
  const latestMortgage = scenarios[0];

  const expensesByCategory = expenseItems.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + item.amount;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(expensesByCategory).map(([name, value]) => ({ name, value }));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budget</h1>
          <p className="text-muted-foreground">Track income vs expenses and see how a mortgage fits.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Budget Item</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_income}
                  onCheckedChange={(checked) => setForm({ ...form, is_income: checked })}
                />
                <Label>{form.is_income ? 'Income' : 'Expense'}</Label>
              </div>
              {!form.is_income && (
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category ?? 'Other'} onValueChange={(v: string | null) => setForm({ ...form, category: v ?? 'Other' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={form.is_income ? 'Salary, freelance, etc.' : 'Rent, groceries, etc.'}
                />
              </div>
              <div className="space-y-2">
                <Label>Monthly Amount ($)</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0"
                />
              </div>
              <Button onClick={handleAdd} disabled={saving}>
                {saving ? 'Adding...' : 'Add Item'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Empty State */}
      {items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Wallet className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No budget items yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Add your income and expenses to see how a mortgage payment fits into your monthly budget.
            </p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger>
                <Button size="lg"><Plus className="mr-2 h-4 w-4" /> Add Your First Item</Button>
              </DialogTrigger>
            </Dialog>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Income</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalExpenses)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remaining</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(remaining)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mortgage Fit */}
      {latestMortgage && totalIncome > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Home className="h-5 w-5" /> How a Mortgage Fits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Latest Mortgage Estimate</p>
                <p className="text-xl font-bold">{formatCurrency(latestMortgage.total_monthly_cost)}/mo</p>
                <Badge variant="secondary">{latestMortgage.loan_type}</Badge>
              </div>
              <div>
                <p className="text-muted-foreground">After Mortgage Payment</p>
                <p className={`text-xl font-bold ${remaining - latestMortgage.total_monthly_cost >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(remaining - latestMortgage.total_monthly_cost)}/mo
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Housing Ratio (DTI)</p>
                <p className="text-xl font-bold">
                  {((latestMortgage.total_monthly_cost / totalIncome) * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {(latestMortgage.total_monthly_cost / totalIncome) <= 0.28
                    ? '✅ Under 28% guideline'
                    : (latestMortgage.total_monthly_cost / totalIncome) <= 0.31
                      ? '⚠️ Between 28-31% (FHA max)'
                      : '🔴 Over 31% — may be tight'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <Card>
          <CardHeader><CardTitle>Expense Breakdown</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[280px] text-muted-foreground">
                <Wallet className="h-8 w-8 mb-2" />
                <p>No expenses yet. Add some to see your breakdown.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Item Lists */}
        <div className="space-y-4">
          {/* Income */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" /> Income
              </CardTitle>
            </CardHeader>
            <CardContent>
              {incomeItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No income items added.</p>
              ) : (
                <div className="space-y-2">
                  {incomeItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <span className="text-sm">{item.description}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-green-600">+{formatCurrency(item.amount)}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Expenses */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" /> Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {expenseItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No expense items added.</p>
              ) : (
                <div className="space-y-2">
                  {expenseItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{item.category}</Badge>
                        <span className="text-sm">{item.description}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-red-600">-{formatCurrency(item.amount)}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
