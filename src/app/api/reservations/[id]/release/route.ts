import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;

    const reservation = await prisma.reservation.findUnique({ where: { id } });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    if (reservation.status !== 'pending') {
      return NextResponse.json(
        { error: `Reservation is already ${reservation.status}` },
        { status: 400 },
      );
    }

    // release: give back the reserved units
    await prisma.$transaction([
      prisma.inventory.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: { reserved: { decrement: reservation.quantity } },
      }),
      prisma.reservation.update({
        where: { id },
        data: { status: 'released' },
      }),
    ]);

    const updated = await prisma.reservation.findUnique({ where: { id } });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('POST /api/reservations/:id/release error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
