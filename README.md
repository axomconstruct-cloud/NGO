# Hope & Heart NGO — Commercial Core v3

Deployable Vercel/Supabase NGO website with secure admin CMS, live fundraising, vertical events/news, public forms, and verified Razorpay payments.

## Implemented
- Responsive animated public UI
- Live campaign received/goal/progress/donor counts and recent contributions
- Vertical auto-scrolling events and news
- Supabase admin authentication and role check
- Admin dashboard with create, edit and delete for campaigns, stories, events and news
- Volunteer/contact status management, donation/subscriber viewing, site settings
- Razorpay order creation and server-side HMAC verification
- Idempotent verification preventing duplicate campaign increments
- Verified receipt API
- RLS, server-only secrets, Vercel Functions, Codespaces workflow

## Supabase
Run in order:
1. `supabase/schema.sql`
2. `supabase/02-security-and-live-campaigns.sql`
3. `supabase/03-production-hardening.sql`

Create a Supabase Auth user, copy the UUID, then run:
```sql
insert into public.admin_users(user_id,name,email)
values ('AUTH_USER_UUID','Administrator','admin@example.com');
```

## Environment
Copy `.env.example` to `.env.local` and fill:
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_SECRET
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
```
Never commit `.env.local`; never use `VITE_` for private secrets.

## Codespaces
```bash
npm install
npm run dev
```
Admin: `/#admin`

## Vercel
Framework Vite; build `npm run build`; output `dist`. Add all environment variables in Vercel and redeploy.

## Before selling
Use client-owned Supabase/Vercel/Razorpay accounts, replace demo branding/content, add jurisdiction-approved privacy/terms/refund/donation policies, test test-mode payments, mobile UI, CRUD, forms and live totals.

Third-party transactional email, SMS, WhatsApp, LLM chatbot, accounting integrations and native apps require separate provider accounts and are not simulated.

## CMS Pro upgrade

Run `supabase/04-cms-upgrade.sql` in the Supabase SQL Editor after the earlier schema files. It adds:

- Gallery management
- Team member management
- Partner/sponsor management
- Public Supabase Storage bucket (`site-media`) for admin image uploads
- Editable hero/about/contact/payment/footer/SEO settings

The admin dashboard now contains `gallery`, `team_members`, and `partners` tabs. Image fields support either pasting an image URL or uploading an image directly to Supabase Storage.

### Payment security

The dashboard stores only public presentation settings such as UPI ID, QR image, minimum donation, and receipt name. Keep `RAZORPAY_KEY_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` only in Vercel environment variables. Never expose either secret in frontend code.
