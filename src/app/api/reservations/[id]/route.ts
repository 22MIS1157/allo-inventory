import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: params.id },
      include: { product: true, warehouse: true },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(reservation);
  } catch (err) {
    console.error('GET /api/reservations/:id error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
