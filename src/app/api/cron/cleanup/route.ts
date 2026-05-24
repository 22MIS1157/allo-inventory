import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// cron endpoint to release expired reservations
// can be called by Vercel Cron every minute
export async function GET() {
  try {
    const expired = await prisma.reservation.findMany({
      where: { status: 'pending', expiresAt: { lt: new Date() } },
    });

    let released = 0;

    for (const r of expired) {
      await prisma.$transaction([
        prisma.inventory.update({
          where: {
            productId_warehouseId: { productId: r.productId, warehouseId: r.warehouseId },
          },
          data: { reserved: { decrement: r.quantity } },
        }),
        prisma.reservation.update({
          where: { id: r.id },
          data: { status: 'released' },
        }),
      ]);
      released++;
    }

    return NextResponse.json({ released, checked: expired.length });
  } catch (err) {
    console.error('Cron cleanup error:', err);
    return NextResponse.json({ error: 'cleanup failed' }, { status: 500 });
  }
}
