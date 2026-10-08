import { GameCreateForm } from '@/components/games/game-create-form';
import { requireUser } from '@/lib/session';

export default async function NewGamePage() {
  // The dashboard layout is not a guard: every page checks the session itself.
  await requireUser();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">New game</h1>
      <GameCreateForm />
    </div>
  );
}
