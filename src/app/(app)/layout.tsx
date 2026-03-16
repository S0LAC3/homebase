import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { AdvisorBanner } from '@/components/advisor-banner';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar userName={profile?.name} userEmail={user.email} />
      <AdvisorBanner />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
