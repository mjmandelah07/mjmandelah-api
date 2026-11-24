# Mjmandelah Inventory API

NestJS API for a store that sells retail and wholesale. It tracks products, categories, stock, sales, receipts, returns, and damaged goods. Images and receipt files are uploaded to the API and stored in Cloudinary. The database is PostgreSQL (Supabase).

Interactive docs are at [http://localhost:3000/docs](http://localhost:3000/docs) after the server starts. The frontend contract is [docs/API.md](docs/API.md). The product requirements are [docs/PRD.md](docs/PRD.md).

## Setup

1. Copy the environment file and set the real database password plus Cloudinary keys:

```bash
cp .env.example .env
```

`DATABASE_URL` in `.env.example` already points at the Supabase pooler. Replace `YOUR-DATABASE-PASSWORD`. Also set `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.

2. Create the tables and the first super admin:

```bash
npm run db:deploy
npm run db:seed
```

Seeded login (change it after the first sign-in):

- email: `admin@mjmandelah.store`
- password: `ChangeMe123!`

Seeded categories: Drinks, Provisions, Groceries.

3. Start the API:

```bash
npm run start:dev
```

- API base: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs`
- Health: `GET /api/health`

## Roles

| Action | Super admin | Admin | Cashier |
| --- | --- | --- | --- |
| Users and store settings | Yes | Admins and cashiers only | No |
| Categories, suppliers, products, stock intake, adjustments | Yes | Yes | No |
| Sell, return, record damage, customers, receipts | Yes | Yes | Yes |
| Void a sale, reports overview | Yes | Yes | Own sales today only |

There is no public sign-up. A manager creates each account.

## Stock and selling

- Retail sales use `retailPrice`.
- Wholesale sales use `wholesalePrice` and must meet `wholesaleMinQty`.
- Credit is wholesale only and requires a customer. Later payments go to `POST /api/customers/:id/payments`.
- A sale, return, damage, intake, adjustment, or void writes a signed stock movement and updates quantity on hand in the same database transaction.
- Adding a product can include opening quantity, product photos, and a supplier receipt image.
- Damage reports require at least one photo and remove that quantity from stock.
- Returns put the quantity back and refund a share of what was actually paid.

## Receipts and the queue

Checkout returns links to print, download a PDF, or read the receipt as JSON. Print and PDF are generated immediately so the cashier is not waiting on a background job.

A PostgreSQL job queue archives a PDF copy to Cloudinary. `GET /api/jobs` shows recent jobs. The worker runs inside the API process every few seconds. No Redis server is required.

## Checks

```bash
npm test
npm run build
```
