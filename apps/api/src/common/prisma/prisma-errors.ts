/** Prisma's unique-constraint error (P2002), checked structurally so it works for every client/adapter. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}
