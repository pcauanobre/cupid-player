'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function LoginInner() {
  const { status } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const callback = params.get('callbackUrl') || '/admin';

  useEffect(() => {
    if (status === 'authenticated') router.replace(callback);
  }, [status, callback, router]);

  return (
    <main className="center-stack">
      <h1>cupid player</h1>
      <p>sign in with google to continue. youtube access needed if you&apos;re the admin.</p>
      <button onClick={() => signIn('google', { callbackUrl: callback })}>
        sign in with google
      </button>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="center-stack">
          <h1>cupid player</h1>
          <p>carregando...</p>
        </main>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
