# Allo Inventory — Concurrency-Safe Reservation System

### Live Demo: [https://allo-inventory-self.vercel.app/](https://allo-inventory-self.vercel.app/)
---

## The Core Problem: Why We Need Concurrency Safety
During flash sales or high-traffic events (think *Day-1 Campus Placement* portal registrations or booking tickets for *Riviera*), standard database systems fall apart due to race conditions. 

When a user proceeds to checkout, payment processing takes several minutes (UPI redirects, card verification, OTP confirmation, etc.). 
* **The Naive Approach (Decrement on Payment)**: If we wait for the payment confirmation to decrement stock, multiple users can see the same last unit, checkout at the same time, pay successfully, and then operations has to manually refund the extra users. *Not a good developer experience.*
* **The Cart Approach (Decrement on Add-to-Cart)**: If we block stock immediately upon adding to the cart, abandoned carts will exhaust our virtual inventory, and sales will plummet.

### The Solution: Temporary Locks (Reservations)
We hold the stock for a 10-minute checkout window. If the payment succeeds, the stock is permanently decremented. If they cancel or the timer runs out, the hold is released automatically so other users can buy it.

---

## Concurrency Handling 
This is where we stand out from the other 1,335 candidates who just wrote standard `prisma.update` queries. In a multi-server serverless environment, standard updates lead to classic race conditions.

To guarantee **race-condition-free reservations**, I used a combination of **PostgreSQL Row-Level Locking** and **Serializable Isolation Levels** inside an interactive transaction:

```typescript
// Look at the core code under src/app/api/reservations/route.ts
const reservation = await prisma.$transaction(async (tx) => {
  const rows = await tx.$queryRaw`
    SELECT id, total, reserved FROM "Inventory"
    WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
    FOR UPDATE
  `;
  // ... check stock and increment reserved
}, { isolationLevel: 'Serializable' })
```

### How this works under the hood:
1. **`FOR UPDATE`**: When Request A hits the reservation endpoint, it locks the specific row in the `Inventory` table matching the product and warehouse.
2. **Blocking Concurrent Requests**: If Request B tries to reserve the same SKU at the exact same millisecond, Postgres blocks Request B. It has to wait until Request A commits or rolls back.
3. **Serial Execution**: Once Request A commits, Request B's lock is acquired. It reads the *new* updated stock numbers, sees `available = 0`, and safely aborts returning a clean `409 Conflict` (Out of Stock) instead of double-allocating.

---

## Reservation Expiry & Lazy Cleanup
To ensure we don't hog connections or rely on expensive, complicated worker queues, I built a hybrid cleanup system:
* **Lazy Cleanup on Read (Primary)**: Every time `GET /api/products` is hit, it triggers a fast cleanup transaction that frees up any pending reservations that are older than 10 minutes. This guarantees the client UI always renders 100% accurate available stock without overhead.
* **Vercel Cron (Safety Net)**: A background cron job `/api/cron/cleanup` is set to run periodically (configured in `vercel.json`) to release expired stock when there's zero user traffic on the site.
* **Check on Confirm**: If a user attempts to complete payment for a reservation that has already expired, the endpoint returns a `410 Gone` and releases the hold.

---

## Idempotency Support
To prevent network retries from creating duplicate reservations (e.g., if a user double-clicks the purchase button over hostel WiFi), I implemented idempotency on the `POST /api/reservations` and `/api/reservations/:id/confirm` endpoints.
* **How**: By sending an `Idempotency-Key` header, the server caches the response status and body in the `IdempotencyKey` database table. On duplicate requests, it returns the cached response instantly without repeating the database side effects.

---

## Tech Stack
* **Framework**: Next.js 14 (App Router) — fully dynamic endpoints with `export const dynamic = 'force-dynamic'` to prevent Vercel route caching.
* **Type Safety**: End-to-end TypeScript with **Zod** schema validations shared between API routes and frontend forms.
* **Database**: Hosted **Supabase PostgreSQL** utilizing connection pooling (`pgbouncer=true` on port `6543`) to prevent serverless instance connection exhaust.
* **ORM**: Prisma ORM with Raw SQL overrides for row locking.
* **Styling**: Tailwind CSS for a premium, clean UI.

---

## How to Run Locally

### 1. Prerequisites
* Node.js 18+
* A hosted PostgreSQL instance (or Supabase free tier)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/22MIS1157/allo-inventory.git
cd allo-inventory
npm install
```

### 3. Database Configurations
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://postgres.xfesvmblywvtauzibfaa:Afnaan727233@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
```

Push the Prisma schema to your database and seed it with high-quality matching product images:
```bash
npx prisma db push
npx ts-node --project prisma/tsconfig.seed.json prisma/seed.ts
```

### 4. Run Dev Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!

---

## Trade-offs & Future Scope
* **Redis for Locks & Cache**: While Postgres `FOR UPDATE` is robust for a single instance, scaling to distributed databases requires a distributed lock manager like **Redlock (Redis)**. In a production system, idempotency keys should also live in Redis with a Time-To-Live (TTL) of 24 hours.
* **WebSockets for Real-time Stock**: Adding WebSockets/Server-Sent Events (SSE) would push stock depletion updates to other active clients instantly without requiring page refetches.
* **Authentication**: There's currently no auth wrapper. In production, reservations must be cryptographically associated with a session token to avoid hijacking.
