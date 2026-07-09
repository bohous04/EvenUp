'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignUp } from '@/components/sign-up';

function SignUpWithCallback() {
  const callbackURL = useSearchParams().get('callbackURL') ?? '/';
  return <SignUp callbackURL={callbackURL} />;
}

// useSearchParams() requires a Suspense boundary so the route can still be
// statically prerendered.
export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpWithCallback />
    </Suspense>
  );
}
