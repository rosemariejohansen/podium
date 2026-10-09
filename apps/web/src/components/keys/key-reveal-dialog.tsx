'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  created: { name: string; key: string } | null;
  onClose: () => void;
}

type CopyState = 'idle' | 'copied' | 'failed';

/** The only place the plaintext key is ever rendered (FR-KEY-2, SEC-WEB-10). */
export function KeyRevealDialog({ created, onClose }: Props) {
  const [copy, setCopy] = useState<CopyState>('idle');
  const close = () => {
    setCopy('idle');
    onClose();
  };
  return (
    // The key cannot be shown again, so a stray click or key press must not lose it: no
    // dismissal by pressing outside, Escape or focus loss, and no X button. The Done button is
    // the one way out.
    <Dialog
      open={created !== null}
      disablePointerDismissal
      onOpenChange={(open, details) => {
        if (!open) details.cancel();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>API key “{created?.name}” created</DialogTitle>
          <DialogDescription>
            Copy it now. You won’t be able to see this key again — only its prefix is kept for
            display.
          </DialogDescription>
        </DialogHeader>
        <code
          data-testid="new-api-key"
          className="block rounded-md bg-muted p-3 font-mono text-sm break-all select-all"
        >
          {created?.key}
        </code>
        {copy === 'failed' && (
          <p role="alert" className="text-sm text-destructive">
            Couldn’t copy automatically. Select the key and copy it manually.
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={async () => {
              if (!created) return;
              try {
                await navigator.clipboard.writeText(created.key);
                setCopy('copied');
              } catch {
                // No permission, no focus, or no clipboard API (plain http): say so.
                setCopy('failed');
              }
            }}
          >
            {copy === 'copied' ? 'Copied' : 'Copy'}
          </Button>
          <Button onClick={close}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
