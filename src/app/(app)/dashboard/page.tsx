'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, Wallet, CheckSquare, Calculator, ArrowRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, WSHFC_PROGRAMS } from '@/lib/mortgage';
import type { Property, BudgetItem, ChecklistItem, MortgageScenario } from '@/types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [scenarios, setScenarios] = useState<MortgageScenario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();

    const fetchData = async () => {
      const [propsRes, budgetRes, checkRes, scenRes] = await Promise.all([
        supabase.from('properties').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('budget_items').select('*').eq('user_id', user.id),
        supabase.from('checklist_items').select('*').eq('user_id', user.id).order('sort_order'),
        supabase.from('mortgage_scenarios').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);

      setProperties(propsRes.data ?? []);
      setBudgetItems(budgetRes.data ?? []);
      setChecklist(checkRes.data ?? []);
      setScenarios(scenRes.data ?? []);
      setLoading(false);
    };

    fetchData();
  }, [user]);

  const totalIncome = budgetItems.filter((b) => b.is_income).reduce((s, b) => s + b.amount, 0);
  const totalExpenses = budgetItems.filter((b) => !b.is_income).reduce((s, b) => s + b.amount, 0);
  const nextChecklistItem = checklist.find((c) => c.status !== 'complete');
  const completedChecklist = checklist.filter((c) => c.status === 'complete').length;
  const latestScenario = scenarios[0];

  const expensesByCategory = budgetItems
    .filter((b) => !b.is_income)
    .reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + item.amount;
      return acc;
    }, {} as Record<string, number>);

  const pieData = Object.entries(expensesByCategory).map(([name, value]) => ({ name, value }));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-muted-foreground">Here&apos;s your homebuying overview.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saved Properties</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{properties.length}</div>
            <Link href="/properties" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Budget</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalIncome - totalExpenses)}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(totalIncome)} income – {formatCurrency(totalExpenses)} expenses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checklist Progress</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {completedChecklist}/{checklist.length}
            </div>
            {nextChecklistItem && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                Next: {nextChecklistItem.title}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mortgage Snapshot</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {latestScenario ? (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(latestScenario.total_monthly_cost)}/mo
                </div>
                <Badge variant="secondary" className="text-xs mt-1">
                  {latestScenario.loan_type}
                </Badge>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">—</div>
                <Link href="/calculator" className="text-xs text-blue-600 hover:underline">
                  Run a calculation
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts and Details */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Budget Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
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
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                <Wallet className="h-8 w-8 mb-2" />
                <p>No budget items yet</p>
                <Button variant="link" asChild className="mt-1">
                  <Link href="/budget">Add budget items</Link>
                </Button>
              </div>
            )}
            {pieData.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-4">
                {pieData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-sm">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span>{entry.name}: {formatCurrency(entry.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* WSHFC Programs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">WA First-Time Buyer Programs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {WSHFC_PROGRAMS.map((program) => (
              <div key={program.name} className="space-y-1">
                <a
                  href={program.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                >
                  {program.name} <ExternalLink className="h-3 w-3" />
                </a>
                <p className="text-sm text-muted-foreground">{program.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
