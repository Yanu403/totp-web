# TOTP Web Authenticator

Browser-based TOTP (Time-based One-Time Password) generator — like Google Authenticator, but as a web app. No install, no phone needed. Open a tab, unlock your vault, and your codes are there.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYanu403%2Ftotp-web)

## Features

- **TOTP code generation** — RFC 6238 / RFC 4226 compliant (SHA-1)
- **QR scanner** — capture codes from your screen with the built-in camera scanner (jsQR)
- **Manual entry** — paste `otpauth://` URLs or enter secret + account details manually
- **Encrypted local vault** — AES-256-GCM with PBKDF2, passphrase-protected
- **Cloud sync** — optional Supabase backup so you don't lose codes when clearing browser data
- **Import / Export** — JSON backup for portability
- **Responsive dark UI** — works on desktop and mobile browsers

## Tech Stack

- React 19 + TypeScript
- Vite (SPA, no SSR)
- Tailwind CSS v4
- Web Crypto API (client-side only — keys never leave the browser)
- Supabase JS client (optional sync)

## Local Development

```bash
# 1. Clone & install
cd totp-web
npm install

# 2. Dev server
npm run dev
# → http://localhost:5173

# 3. Production build
npm run build
# → dist/ (static files)
```

## Supabase Setup (Cloud Sync)

> Cloud sync is **optional**. The app works fully offline without Supabase.

1. **Create a project** at [supabase.com](https://supabase.com) (free tier is enough).

2. **Enable Auth → Sign In / Up**
   - Go to **Authentication → Providers**.
   - Enable **Email** (no email confirmation required for this demo; toggle off "Confirm email" if you want password-only flow).

3. **Create the vaults table**
   Open the **SQL Editor → New query** and run:

   ```sql
   create table if not exists public.vaults (
     id uuid default gen_random_uuid() primary key,
     user_id uuid references auth.users(id) on delete cascade not null,
     cipher text not null,
     updated_at timestamp with time zone default now() not null,
     unique (user_id)
   );

   -- Allow users to read/update only their own row
   alter table public.vaults enable row level security;

   create policy "Users can read own vault"
     on public.vaults
     for select
     to authenticated
     using (auth.uid() = user_id);

   create policy "Users can upsert own vault"
     on public.vaults
     for insert
     to authenticated
     with check (auth.uid() = user_id);

   create policy "Users can update own vault"
     on public.vaults
     for update
     to authenticated
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);
   ```

4. **Get your project URL + anon key**
   - Project Settings → API → copy `URL` and `anon public` key.

5. **Wire it into the app**
   Create `.env` in the project root:

   ```env
   VITE_SUPABASE_URL=https://<your-project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   ```

   Then rebuild: `npm run build`

## Deploy to Vercel

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "init"
   gh repo create totp-web --public --source=. --push
   ```

2. **Import on Vercel**
   - [vercel.com/new](https://vercel.com/new) → import `totp-web`
   - Framework preset: **Vite**
   - Add environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) if using sync
   - Deploy

3. **Done** — your TOTP web app is live at `https://<project>.vercel.app`

## Security Notes

- **All crypto happens in the browser.** Supabase only stores the encrypted blob (cipher text). The passphrase never leaves your device.
- The app uses `PBKDF2` (100k iterations) + `AES-GCM-256` for vault encryption.
- If you forget your passphrase, your vault is unrecoverable — by design.
- For production use, consider enabling email confirmation in Supabase and using a strong passphrase.

## License

MIT
