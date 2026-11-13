# PharmaCore OS — Multi-Branch Pharmacy Management System

> **Assignment:** ALGIONS AI LABS PRIVATE LIMITED — Full-Stack Web Development  
> **Architecture:** Next.js (App Router) + NestJS (Modular Monolith) + PostgreSQL + Redis + Prisma  
> **Notice:** _Fictional products only. This system provides no medical advice._

---

## 1. Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (v1.2+) or Node.js (v20+)
- [Docker](https://www.docker.com/) & Docker Compose (for local PostgreSQL and Redis), or a hosted PostgreSQL database such as [Neon](https://neon.tech/)

### Running the Application

```bash
# 1. Install dependencies across workspaces
bun install

# 2. Start local PostgreSQL and Redis (skip this when using hosted PostgreSQL)
bun run infra:up

# 3. Build shared schemas and generate the Prisma client
bun run build
bun --filter @pharmacy/api prisma:generate

# 4. Apply migrations and load demo data
bun run db:migrate
bun run db:seed

# 5. Start the API and frontend in separate terminals
bun run dev:api
bun run dev:web
```

The application is now accessible at **`http://localhost:3000`**.

### Use hosted PostgreSQL (Neon)

The API and Prisma can connect to Neon directly; no local PostgreSQL server is needed. Redis remains local with the current setup.

1. Create a Neon project and copy its connection strings from the Neon dashboard.
2. Set `DATABASE_URL` in your ignored `.env` to Neon’s **pooled** connection string (it uses `-pooler` in the hostname). Keep the `sslmode=require` parameter. Prisma uses this for normal API connections.
3. Set `DIRECT_URL` to Neon’s **direct, unpooled** connection string. Prisma uses this for schema migrations. For a local database, both variables can use the same URL.

The API uses Prisma’s Neon adapter for runtime queries over WebSockets, which can work on networks that block PostgreSQL TCP when secure WebSockets are allowed. Prisma CLI migrations still use `DIRECT_URL` over PostgreSQL TCP, so run migrations from a network that permits port 5432. This Neon database uses `schema=pharmacy` to keep the existing sample table in `public` separate; preserve that query parameter in both URLs.

4. Generate the Prisma client and apply the existing migrations:

```bash
bun --filter @pharmacy/api prisma:generate
bun run db:migrate
```

To load the demo organization and accounts into that database, run `bun run db:seed`. This writes the sample data described above. Do not commit `.env` or paste database URLs into source files; the URL contains database credentials. The example local values are in `.env.example`.

---

## 2. Pre-configured Demo Accounts

Use the **Evaluator 1-Click Role Login** buttons on the `/login` screen or the top header role-switcher to test all 6 seeded roles. All demo accounts use password `Password123!`:

| Role                | Demo Email             | Password       | Primary Scope                                              |
| ------------------- | ---------------------- | -------------- | ---------------------------------------------------------- |
| **Org Admin**       | `admin@demo.test`      | `Password123!` | Organization-wide access, all branches, full audit log     |
| **Branch Manager**  | `manager@demo.test`    | `Password123!` | Branch sales, returns, adjustments, purchasing and reports |
| **Pharmacist**      | `pharmacist@demo.test` | `Password123!` | POS checkout, sales returns and stock inspection           |
| **Cashier**         | `cashier@demo.test`    | `Password123!` | Sales checkout and printable tax invoices                  |
| **Inventory Clerk** | `clerk@demo.test`      | `Password123!` | Purchase orders, goods receipt and stock adjustments       |
| **Auditor**         | `auditor@demo.test`    | `Password123!` | Read-only reports, reconciliation and audit trail          |

---

## 3. Five Acceptance Criteria — Implementation Mapping

| Acceptance Test                                  | Requirement                                                                                          | Implementation                                                                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#1. FEFO Deduction & Ledger**                  | Sale deducts quantity from earliest-expiry batch and records stock movement.                         | **POS + API**: Preview follows expiry order; checkout locks eligible batches, allocates FEFO in a transaction, and writes immutable `SALE` movements.                |
| **#2. Expired Batch Blocker**                    | An expired batch cannot be sold.                                                                     | **POS + API**: Expired inventory is shown as blocked and excluded by the server-side allocation query; checkout rejects if no valid stock remains.                   |
| **#3. Low Stock & Expiry Warnings**              | System warns about low stock and near-expiry batches.                                                | **Dashboard + Inventory API**: Uses organization expiry settings and medicine reorder levels to calculate alerts from persisted batches.                             |
| **#4. Mandatory Reason for Returns/Adjustments** | Returns and adjustments require a reason code and note, and are auditable.                           | **Sales + API**: Zod and database constraints enforce reason codes and notes; stock and audit changes commit together.                                               |
| **#5. Stock Reconciliation Report**              | Opening stock + purchases − sales ± adjustments = calculated closing vs actual closing (0 variance). | **Reports (`/reports`)**: Mathematical proof table itemizing opening stock, movements, calculated closing, and actual closing with a green **"Reconciled ✔"** badge. |

---

## 4. Frontend Project Structure

```
apps/web/
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx          # Login with 1-click evaluator role picker
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                 # Protected shell with Sidebar, Header & Disclaimer
│   │   │   ├── page.tsx                   # Operations dashboard with KPIs & alert monitors
│   │   │   ├── pos/page.tsx               # Point of Sale with FEFO engine & cart
│   │   │   ├── sales/
│   │   │   │   ├── page.tsx               # Sales list & return processing
│   │   │   │   └── [id]/invoice/page.tsx  # Printable tax invoice (@media print)
│   │   │   ├── inventory/
│   │   │   │   ├── page.tsx               # Batch inventory table & ledger drawer
│   │   │   │   └── adjustments/page.tsx   # Auditable stock adjustment form
│   │   │   ├── medicines/page.tsx         # Organization medicines catalog
│   │   │   ├── purchasing/page.tsx        # Purchase orders & goods receipt
│   │   │   ├── reports/page.tsx           # Reconciliation proof (Acceptance Test #5)
│   │   │   └── audit/page.tsx             # Append-only compliance audit trail
│   │   ├── globals.css                    # Tailwind tokens & print styles
│   │   ├── layout.tsx                     # Root providers & metadata
│   │   └── providers.tsx                  # QueryClientProvider & AuthProvider
│   ├── components/
│   │   ├── common/data-state.tsx          # Reusable loading, error, empty & content wrapper
│   │   ├── layout/                        # Header, Sidebar, Disclaimer banner
│   │   └── ui/                            # Button, Card, Badge, Input, Select, Table, Dialog
│   └── lib/
│       ├── api-client.ts                  # Typed same-origin API client and session refresh
│       ├── auth-context.tsx               # Session state, branch switcher, RBAC permissions
│       ├── mock-data.ts                   # Demo login shortcuts; operational data comes from the API
│       └── utils.ts                       # Currency, date, and UUID utilities
packages/shared/                           # Monorepo shared Zod schemas, types & enums
apps/api/src/                               # NestJS API, authentication, RBAC, stock and reporting workflows
apps/api/prisma/migrations/                 # Initial schema and integrity constraints
```

---

## 5. Development Scripts

- `bun run build`: Builds the shared library (`@pharmacy/shared`)
- `bun run dev:web`: Starts the Next.js development server on port 3000
- `bun run dev:api`: Starts the NestJS API on port 3001
- `bun run db:migrate`: Applies the checked-in PostgreSQL migrations
- `bun run db:seed`: Loads repeatable demo data and users
- `bun run build:api`: Compiles the API
- `bun run build:web`: Compiles Next.js production bundle with static route optimization
- `bun run lint`: Runs ESLint code quality checks
- `bun run format`: Runs Prettier formatter across code and configs
