import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(warehouses);
  } catch (err) {
    console.error('GET /api/warehouses error:', err);
    return NextResponse.json({ error: 'failed to fetch warehouses' }, { status: 500 });
  }
}
