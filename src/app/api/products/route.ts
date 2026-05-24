import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// clean up expired reservations before returning products
// this is the "lazy cleanup" approach
async function releaseExpired() {
  const expired = await prisma.reservation.findMany({
    where: { status: 'pending', expiresAt: { lt: new Date() } },
  });

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
  }
}

export async function GET() {
  try {
    await releaseExpired();

    const products = await prisma.product.findMany({
      include: {
        inventory: {
          include: { warehouse: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // add available field (total - reserved) to each inventory entry
    const result = products.map((p) => ({
      ...p,
      inventory: p.inventory.map((inv) => ({
        ...inv,
        available: inv.total - inv.reserved,
      })),
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('GET /api/products error:', err);
    return NextResponse.json({ error: 'failed to fetch products' }, { status: 500 });
  }
}
