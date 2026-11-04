# PowerPlus Gym Management System

> **Train Strong. Stay Strong.**  
> Addis Ababa's premier athletic fitness center and comprehensive gym operations platform.

---

## 🏋️ Overview

**PowerPlus Gym Management System** is a production-ready, full-stack gym management platform and public web experience tailored for high-performance athletic fitness centers. Built with **React 19**, **TypeScript**, **Tailwind CSS**, and **Supabase (PostgreSQL & Auth)**, the system unifies gym operations across five specialized portals:

1. **Public Gym Website** (`/`, `/memberships`, `/facilities`, `/about`, `/contact`)
   - Real-time membership catalog and dynamic category filtering (Regular, Student, Muslim, Aerobics).
   - Live verified active members counter and facility showcases.
   - Integrated online customer registration and direct contact inquiry system.
2. **Admin / Owner Portal** (`/admin/dashboard`, `/admin/customers`, `/admin/trainers`, `/admin/staff`, `/admin/categories-plans`, `/admin/finances-reports`, `/admin/facilities`, `/admin/settings`)
   - Real-time business intelligence: revenues, expenses, net profits, and member category breakdowns.
   - Dynamic membership category and plan management with instant public sync.
   - Staff credentials and permissions management.
   - Website media management, operating hours, and gym contact information settings.
3. **Reception & Staff Portal** (`/reception/dashboard`, `/reception/lockers`, `/reception/steam`, `/reception/register`, `/reception/contact-messages`)
   - Instant search & member attendance check-in.
   - Customer on-site registration with category validation and photo capture.
   - Physical locker assignments and rental tracking.
   - Steam & sauna access pass administration.
   - Public inquiry message inbox with one-click phone dialing.
4. **Trainer Portal** (`/trainer/dashboard`, `/trainer/members`, `/trainer/coaching`, `/trainer/profile`)
   - Centralized Coaching Center workspace.
   - Assigned member rosters with status tracking.
   - Workout plan builder, meal plan designer, exercise video library, and progress note records.
5. **Customer Portal** (`/customer/dashboard`, `/customer/my-trainer`, `/customer/steam`, `/customer/profile`)
   - Personalized athlete dashboard with membership status, active locker number, and attendance streak.
   - "My Trainer" dedicated portal for direct coaching routines, workouts, and meal plans.
   - Steam/Hammam usage history and remaining session balance.
   - Cultural/Religious privacy features, including Muslim Women's Hours schedule.

---

## 🎨 Visual Identity & Brand Guidelines

- **Primary Accent**: Chartreuse / Electric Lime (`#A3E600` / `rgb(163, 230, 0)`)
- **Background**: Solid Athletic Black (`#080808`)
- **Card & Surface Tones**: Deep Zinc (`#151515`, `#18181B`, `#27272A`)
- **Typography & Aesthetics**: Bold, athletic, high-contrast, modern geometric typography and iconography.

---

## 🛠️ Technology Stack

- **Frontend Core**: [React 19](https://react.dev/), [TypeScript 5.8](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 5](https://vitejs.dev/)
- **Routing**: [React Router v7](https://reactrouter.com/) (with clean lowercase slugs, backward-compatible redirects, and Vercel SPA rewrites)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/), Radix UI primitives, [Phosphor Icons](https://phosphoricons.com/)
- **Animations & Charts**: [Framer Motion](https://www.framer.com/motion/), [Recharts](https://recharts.org/)
- **Backend & Database**: [Supabase](https://supabase.com/) (PostgreSQL 15+, GoTrue Auth, Row Level Security, Storage Buckets, Database Functions & Triggers)
- **Notifications**: [Sonner](https://sonner.emilkowal.ski/)
- **Internationalization (i18n)**: English (`en`), Amharic (`am`), Oromo (`om`), Tigrinya (`ti`), Sidama (`sid`).

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher) or [Bun](https://bun.sh/)
- npm / yarn / pnpm

### 2. Environment Configuration
Create a `.env.local` file in the project root:

```bash
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

> **Security Note**: Never expose the Supabase `service_role` secret key in frontend files or client bundles. All client interactions use the `anon` key secured by PostgreSQL Row Level Security (RLS).

### 3. Install Dependencies
```bash
npm install
```

### 4. Start Development Server
```bash
npm run dev
```
The application will launch locally at `http://localhost:3000`.

### 5. Typecheck & Build
```bash
# Run TypeScript compilation check
npm run typecheck

# Build for production
npm run build

# Preview production build locally
npm run preview
```

---

## 🌐 Production URL Architecture

The application enforces consistent, lowercase, hyphenated URL slugs with full backward-compatibility and deep-link support:

| Route Path | Description | Access Control |
| :--- | :--- | :--- |
| `/` | Gym Homepage (Hero, Stats, Showcase, Plans, Contact) | Public |
| `/memberships` | Direct section scroll to Membership Plans | Public |
| `/facilities` | Direct section scroll to World-Class Facilities | Public |
| `/about` | Direct section scroll to Training Floor Showcase | Public |
| `/contact` | Direct section scroll to Contact & Hours | Public |
| `/login` | Common login portal for all roles | Public / Guest |
| `/forgot-password` | Automatically launches password recovery modal | Public |
| `/reset-password` | Dedicated secure password reset token page | Public / Recovery Token |
| `/admin/dashboard` | Owner KPIs, financial trends, and active members | `owner` role |
| `/admin/customers` | Member directory, status filters, account details | `owner` role |
| `/admin/trainers` | Trainer assignments, PT rates, coach roster | `owner` role |
| `/admin/staff` | Staff accounts, reception permissions, audit logs | `owner` role |
| `/admin/categories-plans`| Category management & membership plan CRUD | `owner` role |
| `/admin/finances-reports`| Revenue & expense breakdown, audit exports | `owner` role |
| `/admin/facilities` | Facilities, lockers, equipment health monitoring | `owner` role |
| `/admin/settings` | Operating hours, media banners, admin password | `owner` role |
| `/reception/dashboard` | Member search, quick check-in, trainer directory | `staff`, `owner` |
| `/reception/lockers` | Locker grid, customer rentals, key handovers | `staff`, `owner` |
| `/reception/steam` | Steam/Hammam daily passes & package visits | `staff`, `owner` |
| `/reception/register` | New member intake, photo, category assignment | `staff`, `owner` |
| `/reception/contact-messages` | Inquiries received from public website | `staff`, `owner` |
| `/trainer/dashboard` | Active client metrics & follow-up alerts | `trainer` role |
| `/trainer/members` | Assigned personal training roster | `trainer` role |
| `/trainer/coaching` | Centralized workout, meal & video coaching suite | `trainer` role |
| `/trainer/profile` | Coach bio, specialties, and contact credentials | `trainer` role |
| `/customer/dashboard` | Membership validity, attendance, active locker | `member`, `owner` |
| `/customer/my-trainer` | Assigned coach, personalized workout & meal plans| `member`, `owner` |
| `/customer/steam` | Steam pass balance and usage logs | `member`, `owner` |
| `/customer/profile` | Personal profile & Women's Hours preferences | `member`, `owner` |

---

## 🔒 Security & Authentication

- **Role-Based Routing**: Strict client-side route guards (`ProtectedRoute`) verified by database-backed role resolution (`resolveTrustedUserRole`).
- **Account Enumeration Protection**: Forgot password requests yield a neutral status response to protect user privacy.
- **Row Level Security (RLS)**: Enforced across all Supabase database tables (`users`, `memberships`, `plans`, `categories`, `lockers`, `steam_access`, `personal_trainer_assignments`).

---

## 🚀 Deployment (Vercel)

The repository includes a production-tuned `vercel.json` configuring SPA rewrites and security headers.

1. Connect the GitHub repository `EthipNova/ppg` to your Vercel project.
2. In the Vercel Dashboard, configure environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. In **Supabase Dashboard > Authentication > URL Configuration**:
   - Set **Site URL** to `https://<your-production-domain>.vercel.app`
   - Add `https://<your-production-domain>.vercel.app/**` to **Redirect URLs**.

---

## 📄 License

&copy; 2026 PowerPlus Gym. All rights reserved.
