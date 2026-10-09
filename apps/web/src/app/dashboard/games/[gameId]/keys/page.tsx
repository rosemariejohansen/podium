import { KeyCreateForm } from '@/components/keys/key-create-form';
import { RevokeKeyButton } from '@/components/keys/revoke-key-button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listKeys } from '@/lib/api/keys';
import { orNotFound } from '@/lib/api/or-not-found';
import { formatDate } from '@/lib/format';
import { requireUser } from '@/lib/session';
import { createKeyAction, revokeKeyAction } from './actions';

export default async function KeysPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const keys = await orNotFound(listKeys(await requireUser(), gameId));
  return (
    <div className="grid gap-8">
      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No API keys yet. Create one below; your game sends it in the X-API-Key header.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell className="font-mono text-xs">{key.prefix}…</TableCell>
                <TableCell className="text-xs">{key.scopes.join(', ')}</TableCell>
                <TableCell>{formatDate(key.createdAt)}</TableCell>
                <TableCell>{formatDate(key.lastUsedAt, 'never')}</TableCell>
                <TableCell>{formatDate(key.expiresAt, 'never')}</TableCell>
                <TableCell>
                  <Badge variant={key.status === 'active' ? 'default' : 'secondary'}>
                    {key.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {key.status !== 'revoked' && (
                    <RevokeKeyButton
                      name={key.name}
                      action={revokeKeyAction.bind(null, gameId, key.id)}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <section className="grid gap-4">
        <h2 className="text-lg font-medium">New API key</h2>
        <KeyCreateForm action={createKeyAction.bind(null, gameId)} />
      </section>
    </div>
  );
}
