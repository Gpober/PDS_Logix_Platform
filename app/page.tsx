import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/crm/data';

export const dynamic = 'force-dynamic';

// The root simply routes people to the right place: into the CRM if signed in,
// otherwise to the login screen.
export default async function Home() {
  const profile = await getCurrentProfile();
  redirect(profile ? '/crm' : '/login');
}
