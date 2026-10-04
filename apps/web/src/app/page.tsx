import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 p-6">
      <h1 className="text-4xl font-bold tracking-tight">Podium</h1>
      <p className="text-lg text-muted-foreground">
        Leaderboards for your game: issue API keys, submit scores from any client, moderate
        suspicious results and watch your traffic.
      </p>
      <div className="flex gap-3">
        <Link href="/dashboard" className={buttonVariants()}>
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
