import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;

    // check idempotency
    const idempotencyKey = req.headers.get('idempotency-key');
    if (idempotencyKey) {
      const existing = await prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (existing) {
        return new NextResponse(existing.response, {
          status: existing.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

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

    // check if expired
    if (new Date() > reservation.expiresAt) {
      // release the reserved stock since it expired
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

      return NextResponse.json({ error: 'Reservation has expired' }, { status: 410 });
    }

    // confirm: decrement total stock AND reserved count (stock is now sold)
    await prisma.$transaction([
      prisma.inventory.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: {
          total: { decrement: reservation.quantity },
          reserved: { decrement: reservation.quantity },
        },
      }),
      prisma.reservation.update({
        where: { id },
        data: { status: 'confirmed' },
      }),
    ]);

    const updated = await prisma.reservation.findUnique({ where: { id } });
    const responseBody = JSON.stringify(updated);

    if (idempotencyKey) {
      await prisma.idempotencyKey.create({
        data: { key: idempotencyKey, response: responseBody, status: 200 },
      }).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('POST /api/reservations/:id/confirm error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
