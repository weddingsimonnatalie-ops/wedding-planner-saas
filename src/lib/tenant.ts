import { prisma } from './prisma';

export type PrismaTransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Wraps a database operation with the tenant RLS context.
 *
 * Sets SET LOCAL "app.current_wedding_id" inside a transaction so PostgreSQL
 * RLS policies can enforce per-tenant isolation. SET LOCAL only persists
 * for the duration of the transaction — this is intentional and correct.
 *
 * Usage:
 *   const guests = await withTenantContext(weddingId, (tx) =>
 *     tx.guest.findMany({ where: { weddingId } })
 *   );
 */
export async function withTenantContext<T>(
  weddingId: string,
  fn: (tx: PrismaTransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // SET LOCAL doesn't support parameterized queries — weddingId is always
    // a CUID (alphanumeric + hyphens) so direct interpolation is safe here.
    await tx.$executeRawUnsafe(`SET LOCAL "app.current_wedding_id" = '${weddingId}'`);
    return fn(tx);
  });
}
