import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/crm/data';
import { Landing } from '@/components/marketing/Landing';

export const dynamic = 'force-dynamic';

// Signed in, go to work. Signed out, land somewhere that says what this is —
// previously an anonymous visitor was bounced straight to a password box with
// no indication of what it belonged to.
export default async function Home() {
  const profile = await getCurrentProfile();
  if (profile) redirect('/crm');
  return <Landing />;
}
