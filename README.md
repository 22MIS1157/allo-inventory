# Allo Inventory - Reservation System

An inventory reservation system for multi-warehouse retail. Handles the race condition between checkout and payment by temporarily holding stock for a configurable window (10 minutes by default).

Live URL: https://allo-inventory-afnaanahmedk391-gmailcoms-projects.vercel.app

## How to run locally

### Prerequisites
- Node.js 18+
- A PostgreSQL database (I used Supabase free tier)

### Setup

```bash
git clone https://github.com/22MIS1157/allo-inventory.git
cd allo-inventory
npm install
```

Create a `.env` file:
```
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

Push the schema and seed the database:
```bash
npx prisma db push
npm run db:seed
```

Run the dev server:
```bash
npm run dev
```

Open http://localhost:3000

## How it works

### The core problem

When a customer clicks "Buy", payment takes time (UPI confirmations, 3DS flows, etc). During that time, other customers see the same stock and might also try to buy. If we just decrement on payment, two people can buy the last unit. If we decrement on add-to-cart, abandoned carts make stock look depleted.

The solution is a reservation - temporarily hold the units when the customer starts checkout, and release them if payment doesn't complete within 10 minutes.

### Concurrency handling

This was the trickiest part. The reservation endpoint uses PostgreSQL row-level locking with `SELECT ... FOR UPDATE` inside an interactive Prisma transaction. Here's what happens:

1. Transaction starts
2. We lock the inventory row for this product+warehouse (`FOR UPDATE` - any other transaction trying to read this row will block until we're done)
3. Check if `total - reserved >= requested quantity`
4. If yes, increment `reserved` and create the reservation
5. If no, throw error (409)
6. Transaction commits, lock is released

Since we're using `FOR UPDATE`, if two requests come in simultaneously for the last unit:
- Request A locks the row, sees 1 available, reserves it, commits
- Request B was waiting for the lock. Now it reads the updated row, sees 0 available, gets 409

I also set the isolation level to `Serializable` which is probably overkill on top of `FOR UPDATE`, but I'd rather be safe here.

### What happens on confirm vs release

**Confirm (payment succeeded):**
- Decrement both `total` and `reserved` by the reservation quantity
- The stock is now permanently sold

**Release (payment failed or timeout):**
- Decrement only `reserved` by the reservation quantity
- The units go back to available (`total - reserved` increases)

### Reservation expiry

I'm using two mechanisms:

1. **Lazy cleanup on read**: Every time `GET /api/products` is called, it first checks for expired pending reservations and releases them. This means the product listing always shows accurate stock.

2. **Vercel Cron job**: There's a `/api/cron/cleanup` endpoint configured to run every 5 minutes via `vercel.json`. This handles cases where nobody is viewing the products page but reservations are expiring.

3. **Check on confirm**: When someone tries to confirm an expired reservation, it returns 410 and releases the hold.

I went with lazy cleanup as the primary mechanism because it's simpler than running a background worker and doesn't need any extra infrastructure. The cron is a safety net.

### Idempotency (bonus)

The `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints support an `Idempotency-Key` header. If you send the same key twice:

1. First request: processes normally, stores the response in an `IdempotencyKey` table with the key and the response body + status code
2. Second request: looks up the key, finds it exists, returns the stored response without doing anything

This prevents double-reservations if the client retries due to network issues. In a real app the idempotency keys should expire after some time (maybe 24 hours), but I didn't implement that cleanup.

The storage is in Postgres (the `IdempotencyKey` model). In production you'd probably want Redis for this since it's faster and has built-in TTL, but Postgres works fine for this scale.

## API endpoints

| Method | Path | What it does |
|--------|------|-------------|
| GET | /api/products | List all products with available stock per warehouse |
| GET | /api/warehouses | List all warehouses |
| POST | /api/reservations | Reserve units. Body: `{productId, warehouseId, quantity}`. Returns 409 if not enough stock |
| GET | /api/reservations/:id | Get reservation details |
| POST | /api/reservations/:id/confirm | Confirm reservation (payment succeeded). Returns 410 if expired |
| POST | /api/reservations/:id/release | Release reservation (payment failed / user cancelled) |
| GET | /api/cron/cleanup | Release all expired reservations (called by Vercel Cron) |

## Trade-offs and things I'd do differently

### What I skipped

- **Authentication**: There's no user model or auth. In production you'd need to associate reservations with users and make sure one user can't confirm another's reservation.
- **Optimistic UI updates**: I refetch data after mutations. With SWR or React Query you could do optimistic updates for a snappier feel.
- **Stock alerts**: No webhook or notification when stock is running low.
- **Multi-item reservations**: Currently you can only reserve one product per reservation. A real checkout would have a cart with multiple items.

### What I'd improve with more time

- **Redis for distributed locking**: The current `SELECT FOR UPDATE` approach works great for a single database, but if you had read replicas, the lock wouldn't help on replicas. Redis distributed locks (Redlock) would be better.
- **WebSocket for real-time stock updates**: Right now if someone else reserves the last unit, you won't see it until you refresh. WebSocket or Server-Sent Events would push stock changes to all connected clients.
- **Better error recovery**: If the app crashes between updating inventory and creating the reservation (unlikely with transactions, but still), there's no rollback mechanism beyond Postgres itself.
- **Rate limiting**: The reservation endpoint should be rate-limited to prevent abuse (someone holding all stock with bot requests).
- **Reservation quantity limits**: Right now you can reserve all units in one request. Should probably cap it.

### Why Prisma raw queries for the locking

Prisma doesn't have built-in support for `SELECT ... FOR UPDATE`, so I had to use `$queryRaw` for that specific query. The rest of the CRUD operations use the regular Prisma client. I know mixing raw SQL with ORM calls looks a bit messy, but the alternative was either (a) doing everything in raw SQL, or (b) using optimistic concurrency with version columns. I went with `FOR UPDATE` because it's the most straightforward way to guarantee correctness and it's what you'd actually use in production.

## Tech stack

- Next.js 14 (App Router)
- TypeScript
- Prisma ORM + raw SQL for locking
- PostgreSQL (Supabase)
- Zod for validation
- Tailwind CSS
- Vercel (deployment)
