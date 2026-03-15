# 🏠 HomeBase

**Homebuyer property analysis & mortgage planning tool** — built for Seattle-area first-time homebuyers.

Track properties, compare FHA/Conventional/VA mortgages, manage your budget, and follow a step-by-step checklist from pre-approval to closing.

## Features

- **Property Tracker** — Save properties with details, notes, and listing links. Compare side by side.
- **Mortgage Calculator** — FHA (King County $977,500 limit, 3.5% down, MIP), Conventional (5% & 20%), and VA loans with amortization charts.
- **Budget Planner** — Track income vs expenses, see how a mortgage payment fits your monthly budget with DTI analysis.
- **Homebuying Checklist** — Pre-loaded steps from credit check to closing day. Reorder, add custom steps, track progress.
- **Advisor Access** — Invite your loan officer or agent for read-only access to your data.
- **Onboarding Wizard** — Quick financial profile setup to personalize your experience.
- **WA First-Time Buyer Programs** — Links to WSHFC Home Advantage, House Key, and DPA programs.

## Tech Stack

- **Framework:** [Next.js 15](https://nextjs.org) (App Router, React 19)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- **Auth & Database:** [Supabase](https://supabase.com) (PostgreSQL, Auth, RLS)
- **Charts:** [Recharts](https://recharts.org)
- **Deployment:** [Vercel](https://vercel.com)

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

### Setup

1. **Clone the repo:**
   ```bash
   git clone https://github.com/S0LAC3/homebase.git
   cd homebase
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase project URL and anon key.

4. **Run the database migration:**

   Copy the contents of `supabase/migrations/001_initial_schema.sql` into your Supabase SQL editor and run it. This creates all tables, indexes, RLS policies, and an auto-profile trigger.

5. **Configure Google OAuth** in your Supabase dashboard:
   - Go to Authentication → Providers → Google
   - Add your Google OAuth client ID and secret
   - Set the redirect URL to `http://localhost:3000/auth/callback`

6. **Start dev server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── (app)/                      # Authenticated routes
│   │   ├── dashboard/page.tsx      # Summary cards, charts, WA programs
│   │   ├── properties/page.tsx     # Property list + add form
│   │   ├── properties/[id]/page.tsx# Property detail + mortgage scenarios
│   │   ├── calculator/page.tsx     # FHA/Conv/VA comparison calculator
│   │   ├── budget/page.tsx         # Income vs expenses + mortgage fit
│   │   ├── checklist/page.tsx      # Step-by-step homebuying checklist
│   │   ├── settings/page.tsx       # Profile editing + advisor access
│   │   └── onboard/page.tsx        # Financial profile wizard
│   └── auth/                       # Auth callback + error pages
├── components/
│   ├── navbar.tsx                  # App navigation
│   ├── auth-provider.tsx           # Auth context
│   └── ui/                         # shadcn/ui components
├── lib/
│   ├── mortgage.ts                 # Mortgage calc engine + constants
│   ├── supabase/                   # Supabase client/server/middleware
│   └── utils.ts
├── types/index.ts                  # TypeScript interfaces
└── middleware.ts                   # Supabase auth middleware
```

## King County FHA Details (2025)

| Parameter | Value |
|-----------|-------|
| FHA Loan Limit | $977,500 |
| Min Down Payment | 3.5% (credit 580+) |
| Upfront MIP | 1.75% of base loan |
| Annual MIP | 0.55% (life of loan) |
| Property Tax Rate | ~1% (King County avg) |

## License

MIT
