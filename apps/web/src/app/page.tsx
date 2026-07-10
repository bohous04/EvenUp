'use client';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { SignIn } from '@/components/sign-in';
import { GroupsDashboard } from '@/components/groups-dashboard';

export default function HomePage() {
  const { data: session, isPending } = useSession();
  // Show the loading placeholder only until the FIRST session resolve. Better
  // Auth refetches the session after a password sign-in — including the one that
  // returns a 2FA challenge and creates no session — and blanking the page on
  // that refetch would unmount <SignIn> and drop its in-place 2FA step. After
  // the first resolve we keep rendering the current view through refetches.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isPending) setReady(true);
  }, [isPending]);

  if (isPending && !ready) {
    return <p className="py-10 text-center text-zinc-500 dark:text-zinc-400">…</p>;
  }
  return session?.user ? <GroupsDashboard /> : <SignIn />;
}
