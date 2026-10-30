# Deploy the dashboard and API

The browser dashboard is a static site. Netlify Functions will provide the same `/api/...` routes used by the local Node server. Supabase Postgres stores readings so they remain available to the deployed site across function invocations.

> **Prototype security:** dashboard data routes now require an authenticated Supabase user. Disable public sign-ups and create engineer accounts from the Supabase Dashboard. Device writes still require one token per machine. This is a prototype access layer, not a complete production security review; use synthetic readings until KPA approves the hardware, network, account, and operating controls.

## 1. Create the database

1. Create a Supabase project.
2. In its SQL Editor, run `supabase/schema.sql` from this project.
   For an existing project that already ran the original schema, run `supabase/maintenance-inspections.sql` to add the engineer inspection log.
3. Optional, for the six-machine demo: run `supabase/seed-two-more-motors.sql` to add fictional `motor-2` and `motor-3` readings to each machine. This script leaves existing readings unchanged and can be rerun safely. Replace these placeholder motor IDs with KPA's verified motor names later.
4. In **Project Settings → API Keys**, copy the project URL, the `sb_publishable_...` publishable key, and the `sb_secret_...` secret key. The publishable key identifies the public app; the secret key belongs only in Netlify's server-side environment settings. [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys)
5. In **Authentication → Settings**, disable **Allow new users to sign up**. Then open **Authentication → Users** and invite or create only approved engineer accounts. [Supabase Auth settings](https://supabase.com/docs/guides/auth/general-configuration) · [User management](https://supabase.com/docs/guides/auth/users)
6. In **Authentication → URL Configuration**, set **Site URL** to the published Netlify site URL and add that URL to **Redirect URLs**. Invitation and password recovery emails use this destination; use the production website URL, not `localhost:3000`. [Supabase redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls)

## 2. Set Netlify environment variables

In the Netlify site's environment-variable settings, add these values for the Production context and make sure their scope includes Functions:

- `SUPABASE_URL` — the Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY` — the `sb_publishable_...` key used for engineer sign-in. It is designed for public-app use; keep its scope available to Netlify Functions.
- `SUPABASE_SECRET_KEY` — the private `sb_secret_...` key.
- `DEVICE_TOKEN_MACHINE_1` through `DEVICE_TOKEN_MACHINE_6` — six different, long random tokens, one per crane.

Do not put any of these values in `index.html`, `netlify.toml`, or Git. The local `start-server.cmd` token is only for a laptop demo and must not be reused for real devices.

## 3. Deploy

The included `netlify.toml` publishes files from `public/` and deploys functions from `netlify/functions/`, leaving server and database source files outside the public directory. Push the project to the Git repository connected to the Netlify site, or upload a deploy using Netlify's deployment workflow. After deployment, check `https://<your-site>/api/health`.

Dashboard requests for `/api/v1/...` data now require a signed-in Supabase Auth account. The browser signs in using the publishable key and the function checks the user's access token with Supabase Auth before returning readings. The page keeps the session in the current browser tab, handles invite and password-recovery links, and provides a sign-out button. There is no public sign-up form.

In a synthetic-data demo, ESP32s can send `POST /api/v1/readings` to the HTTPS site using that crane's matching token in the `Authorization: Bearer ...` header. This device route is separate from engineer dashboard sign-in.

## 4. Local and deployed data are separate

The local `server.js` still saves its demo readings to `data/readings.json`. It now also requires an authenticated Supabase account to read them. When running `start-server.cmd`, enter the project URL and publishable key when prompted. The deployed function saves readings to Supabase. A reading submitted to the laptop is not automatically copied to Supabase.

The live dashboard includes a proposed Monday-to-Saturday maintenance rotation and an engineer inspection form. Inspection records include motor selection, system functionality, wiring, sensors, mounting, noise/vibration, safety guards, lubrication/leaks, comments, and follow-up actions. For an existing Supabase project, run `supabase/maintenance-inspections.sql` before deploying the inspection form. Condition thresholds for urgent motor classification remain unconfigured; use machine-specific limits approved for the prototype before displaying alarms.
