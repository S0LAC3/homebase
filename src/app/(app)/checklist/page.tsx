'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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
import {
  CheckSquare,
  Plus,
  Circle,
  Clock,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ChecklistItem } from '@/types';
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/mortgage';

const statusConfig = {
  pending: { label: 'Pending', icon: Circle, color: 'text-slate-400', badge: 'secondary' as const },
  in_progress: { label: 'In Progress', icon: Clock, color: 'text-amber-500', badge: 'default' as const },
  complete: { label: 'Complete', icon: CheckCircle2, color: 'text-green-500', badge: 'secondary' as const },
};

export default function ChecklistPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: '',
  });

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from('checklist_items')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order')
      .then(({ data }) => {
        setItems(data ?? []);
        setLoading(false);
      });
  }, [user]);

  const handleAdd = async () => {
    if (!user || !form.title) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const maxOrder = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) : 0;
    const { data, error } = await supabase
      .from('checklist_items')
      .insert({
        user_id: user.id,
        title: form.title,
        description: form.description || null,
        status: 'pending',
        due_date: form.due_date || null,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add item');
    } else if (data) {
      setItems([...items, data]);
      toast.success('Checklist item added');
      setDialogOpen(false);
      setForm({ title: '', description: '', due_date: '' });
    }
    setSaving(false);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('checklist_items')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update status');
    } else {
      setItems(items.map((i) => (i.id === id ? { ...i, status: newStatus as ChecklistItem['status'] } : i)));
    }
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('checklist_items').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
    } else {
      setItems(items.filter((i) => i.id !== id));
      toast.success('Item removed');
    }
  };

  const handleSeedDefaults = async () => {
    if (!user) return;
    setSaving(true);
    const supabase = createClient();
    const newItems = DEFAULT_CHECKLIST_ITEMS.map((item) => ({
      user_id: user.id,
      title: item.title,
      description: item.description,
      status: 'pending' as const,
      sort_order: item.sort_order,
    }));

    const { data, error } = await supabase
      .from('checklist_items')
      .insert(newItems)
      .select();

    if (error) {
      toast.error('Failed to create checklist');
    } else if (data) {
      setItems([...items, ...data]);
      toast.success('Default checklist created!');
    }
    setSaving(false);
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;

    const newItems = [...items];
    [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];

    // Update sort orders
    const updates = newItems.map((item, i) => ({
      ...item,
      sort_order: i + 1,
    }));

    setItems(updates);

    const supabase = createClient();
    await Promise.all(
      updates.map((item) =>
        supabase.from('checklist_items').update({ sort_order: item.sort_order }).eq('id', item.id)
      )
    );
  };

  const completed = items.filter((i) => i.status === 'complete').length;
  const progress = items.length > 0 ? (completed / items.length) * 100 : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Homebuying Checklist</h1>
          <p className="text-muted-foreground">Track your progress from pre-approval to closing.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Step</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Checklist Item</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., Schedule home inspection"
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Notes or details..."
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date (optional)</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <Button onClick={handleAdd} disabled={saving}>
                {saving ? 'Adding...' : 'Add Item'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {completed} of {items.length} steps complete
            </span>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-3" />
        </CardContent>
      </Card>

      {/* Checklist Items */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckSquare className="h-12 w-12 mb-4" />
            <p className="text-lg font-medium">No checklist items yet</p>
            <p className="text-sm mb-4">Start with the default homebuying steps or add your own.</p>
            <Button onClick={handleSeedDefaults} disabled={saving}>
              {saving ? 'Creating...' : 'Load Default Checklist'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const config = statusConfig[item.status];
            const StatusIcon = config.icon;

            return (
              <Card key={item.id} className={item.status === 'complete' ? 'opacity-60' : ''}>
                <CardContent className="flex items-start gap-4 py-4">
                  <button
                    onClick={() => {
                      const nextStatus =
                        item.status === 'pending'
                          ? 'in_progress'
                          : item.status === 'in_progress'
                            ? 'complete'
                            : 'pending';
                      handleStatusChange(item.id, nextStatus);
                    }}
                    className={`mt-0.5 ${config.color} hover:opacity-70 transition-opacity`}
                  >
                    <StatusIcon className="h-5 w-5" />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${item.status === 'complete' ? 'line-through' : ''}`}>
                        {item.title}
                      </span>
                      <Badge variant={config.badge} className="text-xs">
                        {config.label}
                      </Badge>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    )}
                    {item.due_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Due: {new Date(item.due_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Select
                      value={item.status}
                      onValueChange={(v) => handleStatusChange(item.id, v)}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="complete">Complete</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={index === 0}
                      onClick={() => handleMove(index, 'up')}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={index === items.length - 1}
                      onClick={() => handleMove(index, 'down')}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
