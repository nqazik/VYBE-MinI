import { Card, Logo } from '../components/ui'

/** Shown instead of crashing when .env.local hasn't been filled in yet. */
export function Setup() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-5 py-10">
      <Logo size="lg" />
      <Card className="space-y-4 p-6">
        <h1 className="text-2xl font-extrabold">One more step ✨</h1>
        <p className="text-muted">VYBE Mini needs to know where your Supabase project is.</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Copy <code className="rounded bg-surface-2 px-1.5 py-0.5">.env.example</code> to{' '}
            <code className="rounded bg-surface-2 px-1.5 py-0.5">.env.local</code>.
          </li>
          <li>
            Paste your project’s URL and <strong>public</strong> anon key into it (Supabase → Project Settings → API).
          </li>
          <li>
            Run <code className="rounded bg-surface-2 px-1.5 py-0.5">supabase/schema.sql</code> in the Supabase SQL Editor and switch on
            anonymous sign-ins.
          </li>
          <li>Restart <code className="rounded bg-surface-2 px-1.5 py-0.5">npm run dev</code> (or rebuild).</li>
        </ol>
        <p className="text-xs text-muted">The README walks through each step with screenshots-in-words.</p>
      </Card>
    </main>
  )
}
