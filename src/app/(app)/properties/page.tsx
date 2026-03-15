'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Building2, MapPin, Bed, Bath, Ruler, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, KING_COUNTY_PROPERTY_TAX_RATE } from '@/lib/mortgage';
import type { Property } from '@/types';
import Link from 'next/link';

export default function PropertiesPage() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    address: '', city: 'Seattle', state: 'WA', zip: '', price: '',
    sqft: '', bedrooms: '', bathrooms: '', hoa_monthly: '',
    property_tax_annual: '', year_built: '', listing_url: '', notes: '',
  });

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from('properties')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProperties(data ?? []);
        setLoading(false);
      });
  }, [user]);

  const handleAdd = async () => {
    if (!user || !form.address || !form.price) {
      toast.error('Address and price are required');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const price = parseFloat(form.price);
    const { data, error } = await supabase
      .from('properties')
      .insert({
        user_id: user.id,
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        price,
        sqft: form.sqft ? parseInt(form.sqft) : null,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms) : null,
        bathrooms: form.bathrooms ? parseFloat(form.bathrooms) : null,
        hoa_monthly: form.hoa_monthly ? parseFloat(form.hoa_monthly) : null,
        property_tax_annual: form.property_tax_annual
          ? parseFloat(form.property_tax_annual)
          : Math.round(price * KING_COUNTY_PROPERTY_TAX_RATE),
        year_built: form.year_built ? parseInt(form.year_built) : null,
        listing_url: form.listing_url || null,
        notes: form.notes || null,
      })
      .select()
      .single();

    if (error) {
      toast.error('Failed to add property');
    } else if (data) {
      setProperties([data, ...properties]);
      toast.success('Property added!');
      setDialogOpen(false);
      setForm({
        address: '', city: 'Seattle', state: 'WA', zip: '', price: '',
        sqft: '', bedrooms: '', bathrooms: '', hoa_monthly: '',
        property_tax_annual: '', year_built: '', listing_url: '', notes: '',
      });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Properties</h1>
          <p className="text-muted-foreground">Track and compare properties you&apos;re interested in.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Property</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Property</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Address *</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>ZIP</Label>
                  <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} placeholder="98101" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Price *</Label>
                  <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="750000" />
                </div>
                <div className="space-y-2">
                  <Label>Sq Ft</Label>
                  <Input type="number" value={form.sqft} onChange={(e) => setForm({ ...form, sqft: e.target.value })} placeholder="1800" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label>Beds</Label>
                  <Input type="number" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Baths</Label>
                  <Input type="number" step="0.5" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Year Built</Label>
                  <Input type="number" value={form.year_built} onChange={(e) => setForm({ ...form, year_built: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Monthly HOA ($)</Label>
                  <Input type="number" value={form.hoa_monthly} onChange={(e) => setForm({ ...form, hoa_monthly: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Annual Property Tax ($)</Label>
                  <Input type="number" value={form.property_tax_annual} onChange={(e) => setForm({ ...form, property_tax_annual: e.target.value })} placeholder="Auto: ~1% of price" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Listing URL</Label>
                <Input value={form.listing_url} onChange={(e) => setForm({ ...form, listing_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Great backyard, needs new roof..." />
              </div>
              <Button onClick={handleAdd} disabled={saving}>
                {saving ? 'Adding...' : 'Add Property'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mb-4" />
            <p className="text-lg font-medium">No properties saved yet</p>
            <p className="text-sm">Add your first property to start comparing.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((property) => (
            <Link key={property.id} href={`/properties/${property.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{formatCurrency(property.price)}</CardTitle>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {property.address}, {property.city}, {property.state}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3 text-sm text-muted-foreground">
                    {property.bedrooms && (
                      <span className="flex items-center gap-1"><Bed className="h-3.5 w-3.5" /> {property.bedrooms} bd</span>
                    )}
                    {property.bathrooms && (
                      <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" /> {property.bathrooms} ba</span>
                    )}
                    {property.sqft && (
                      <span className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" /> {property.sqft.toLocaleString()} sqft</span>
                    )}
                  </div>
                  {property.listing_url && (
                    <Badge variant="outline" className="mt-3 text-xs">
                      <ExternalLink className="h-3 w-3 mr-1" /> Listing
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
