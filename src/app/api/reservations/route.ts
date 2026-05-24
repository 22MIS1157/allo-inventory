import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { reserveSchema } from '@/lib/validations';

const RESERVATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = reserveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;

    // check idempotency header
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

    // this is the critical section
    // use interactive transaction with row-level locking to prevent race conditions
    // if two requests come in for the last unit, only one will succeed
    const reservation = await prisma.$transaction(async (tx) => {
      // lock the inventory row - other transactions trying to reserve the same
      // product+warehouse will block here until we commit or rollback
      const rows = await tx.$queryRaw<
        Array<{ id: string; total: number; reserved: number }>
      >`
        SELECT id, total, reserved FROM "Inventory"
        WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        throw new Error('INVENTORY_NOT_FOUND');
      }

      const inv = rows[0];
      const available = inv.total - inv.reserved;

      if (available < quantity) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      // safe to increment reserved count now since we hold the lock
      await tx.$queryRaw`
        UPDATE "Inventory"
        SET reserved = reserved + ${quantity}
        WHERE id = ${inv.id}
      `;

      // create the reservation
      return tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: 'pending',
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
        },
      });
    }, {
      isolationLevel: 'Serializable',
      timeout: 10000,
    });

    const responseBody = JSON.stringify(reservation);

    // save idempotency key if provided
    if (idempotencyKey) {
      await prisma.idempotencyKey.create({
        data: { key: idempotencyKey, response: responseBody, status: 201 },
      }).catch(() => {}); // ignore if duplicate
    }

    return NextResponse.json(reservation, { status: 201 });
  } catch (err: any) {
    if (err.message === 'INSUFFICIENT_STOCK') {
      return NextResponse.json(
        { error: 'Not enough stock available' },
        { status: 409 },
      );
    }
    if (err.message === 'INVENTORY_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Product not found in this warehouse' },
        { status: 404 },
      );
    }
    console.error('POST /api/reservations error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
