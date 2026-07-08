'use client';
import { useSession } from '@/lib/auth-client';
import { SignIn } from '@/components/sign-in';
import { GroupsDashboard } from '@/components/groups-dashboard';

export default function HomePage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <p className="py-10 text-center text-zinc-500">…</p>;
  }
  return session?.user ? <GroupsDashboard /> : <SignIn />;
}
