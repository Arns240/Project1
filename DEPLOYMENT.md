# Publish the dashboard and API

The browser dashboard is a static site. Netlify Functions will provide the same `/api/...` routes used by the local Node server. Supabase Postgres stores readings so they remain available to the deployed site across function invocations.

> **Synthetic-data prototype only:** the API currently requires a device token for writes, but its read routes do not require engineer sign-in. Do not connect real KPA or other operational readings until engineer authentication and access control have been added and reviewed. The six-machine demo can be deployed with fictional readings for interface work.

## 1. Create the database

1. Create a Supabase project.
2. In its SQL Editor, run `supabase/schema.sql` from this project.
3. In the Supabase project settings, create or copy the project URL and the `sb_secret_...` secret key. Keep the key private; it belongs only in Netlify's server-side environment settings. Supabase's newer secret keys are intended for backend code and are sent using the `apikey` header. [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys)

## 2. Set Netlify environment variables

In the Netlify site's environment-variable settings, add these values for the Production context and make sure their scope includes Functions:

- `SUPABASE_URL` — the Supabase project URL.
- `SUPABASE_SECRET_KEY` — the private `sb_secret_...` key.
- `DEVICE_TOKEN_MACHINE_1` through `DEVICE_TOKEN_MACHINE_6` — six different, long random tokens, one per crane.

Do not put any of these values in `index.html`, `netlify.toml`, or Git. The local `start-server.cmd` token is only for a laptop demo and must not be reused for real devices.

## 3. Deploy

The included `netlify.toml` publishes files from `public/` and deploys functions from `netlify/functions/`, leaving server and database source files outside the public directory. Push the project to the Git repository connected to the Netlify site, or upload a deploy using Netlify's deployment workflow. After deployment, check `https://<your-site>/api/health`.

The dashboard's existing `/api/...` requests will route to the Netlify Function on the same site. In a synthetic-data demo, the ESP32s can send `POST /api/v1/readings` to that HTTPS site using the matching crane token in the `Authorization: Bearer ...` header. Do not connect real crane hardware until engineer access control is in place.

## 4. Local and deployed data are separate

The local `server.js` still saves its demo readings to `data/readings.json`. The deployed function saves to Supabase. A reading submitted to the laptop is not automatically copied to Supabase.

Condition thresholds and maintenance actions are not implemented. The dashboard shows measurements only; use machine-specific limits approved for the prototype before displaying alarms.
