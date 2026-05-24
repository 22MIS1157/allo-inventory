const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // clean up
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // create warehouses
  const mumbai = await prisma.warehouse.create({
    data: { name: 'Mumbai Central', location: 'Mumbai, Maharashtra' },
  });
  const bangalore = await prisma.warehouse.create({
    data: { name: 'Bangalore Hub', location: 'Bangalore, Karnataka' },
  });
  const delhi = await prisma.warehouse.create({
    data: { name: 'Delhi NCR', location: 'New Delhi' },
  });

  // create products
  // Using picsum.photos for reliable, always-working images
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'Wireless Earbuds Pro',
        description: 'Active noise cancellation, 24hr battery life',
        price: 2999,
        image: 'https://picsum.photos/seed/earbuds/400/300',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Smart Watch Ultra',
        description: 'AMOLED display, heart rate monitor, GPS',
        price: 5499,
        image: 'https://picsum.photos/seed/smartwatch/400/300',
      },
    }),
    prisma.product.create({
      data: {
        name: 'USB-C Hub 7-in-1',
        description: 'HDMI, USB 3.0, SD card, ethernet, PD charging',
        price: 1799,
        image: 'https://picsum.photos/seed/usbhub/400/300',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Mechanical Keyboard',
        description: 'Cherry MX switches, RGB backlight, full metal body',
        price: 4299,
        image: 'https://picsum.photos/seed/keyboard/400/300',
      },
    }),
    prisma.product.create({
      data: {
        name: 'Portable SSD 1TB',
        description: 'USB 3.2 Gen 2, 1050 MB/s read speed',
        price: 6999,
        image: 'https://picsum.photos/seed/ssd/400/300',
      },
    }),
  ]);

  // create inventory - different stock at each warehouse
  const stockMap = [
    { product: 0, warehouse: mumbai.id, total: 15 },
    { product: 0, warehouse: bangalore.id, total: 8 },
    { product: 0, warehouse: delhi.id, total: 3 },
    { product: 1, warehouse: mumbai.id, total: 5 },
    { product: 1, warehouse: bangalore.id, total: 12 },
    { product: 1, warehouse: delhi.id, total: 2 },
    { product: 2, warehouse: mumbai.id, total: 25 },
    { product: 2, warehouse: bangalore.id, total: 18 },
    { product: 3, warehouse: mumbai.id, total: 7 },
    { product: 3, warehouse: delhi.id, total: 4 },
    { product: 4, warehouse: bangalore.id, total: 10 },
    { product: 4, warehouse: delhi.id, total: 6 },
  ];

  for (const item of stockMap) {
    await prisma.inventory.create({
      data: {
        productId: products[item.product].id,
        warehouseId: item.warehouse,
        total: item.total,
        reserved: 0,
      },
    });
  }

  console.log('Seeded: 3 warehouses, 5 products, 12 inventory entries');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
