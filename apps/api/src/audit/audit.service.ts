import { Injectable } from '@nestjs/common';
import type { AuditAction, Prisma } from '../generated/prisma/client.js';

export interface AuditEntry {
  actorId: string;
  gameId: string | null;
  action: AuditAction;
  targetType: string;
  targetId: string;
  ip: string | null;
  meta?: Prisma.InputJsonObject;
}

@Injectable()
export class AuditService {
  /** Writes inside the caller's transaction so the change and its audit row commit together (FR-AUD-1). */
  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: { ...entry, meta: entry.meta ?? {} } });
  }
}
