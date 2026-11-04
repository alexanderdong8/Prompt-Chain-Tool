# Chain Lab: prompt chain tool for Punchline

A superadmin-only tool for building and running **multi-step prompt chains**. Each step is one model call, and its output feeds the next step. For example:

1. Take in an image and describe it in text.
2. Take the description and say what's funny about it.
3. Take that and write five short, funny captions.

It's the third app in the Punchline project, next to the public app ([humor-project](https://github.com/alexanderdong8/humor-project)) and the admin area ([humor-project-admin](https://github.com/alexanderdong8/humor-project-admin)), and shares their Supabase project.

## What it does

- **Chains** (`/`): every chain, its steps shown as a linked row, run counts, and the latest media. Create a chain, empty or from the 3-step example.
- **Edit a chain** (`/chains/[id]`): rename it or edit its description, or delete it (its steps and media go with it).
- **Steps**: add a step (at the end or before any step), edit it, delete it (later steps move up), and reorder it: ↑ / ↓, or "Move to" any position. Each step has:
  - a name and a prompt, with `{{previous}}`, `{{step N}}`, and `{{input}}` placeholders;
  - what it **takes in**: the image, the previous step's output, or both;
  - what it **puts out**: text, or a list of 1–10 captions;
  - a **model**: automatic (the active models from Backstage, in priority order, falling through when one is busy) or a specific one.
- **Run** (side panel): pick an image from the library or upload one, add optional starting text, and run. Steps run one request at a time, so you see each step finish with its model and timing.
- **Generated media** (`/chains/[id]/media`): every run of the chain, with its image and captions. Open a run (`/runs/[id]`) to see the exact prompt each step sent, the model, the output, and the time it took.
- **Light / dark / system** theme switch in the header, saved in a cookie so the first paint is already right.

## Access

Only accounts with `profiles.is_superadmin = true` get in, checked three times:

1. `proxy.ts` on every request: signed out → `/login`; not a superadmin → `/denied`.
2. `requireAdmin()` / `adminOrNull()` in every page and server action.
3. Row-level security on every Chain Lab table (`public.is_superadmin()`), so the database refuses everyone else regardless of the app.

## Database

`supabase/chain_lab.sql` (run once as the database owner, after the admin app's `admin.sql` and `pipeline.sql`; safe to re-run):

| Table | |
| --- | --- |
| `chain_lab_chains` | name, description |
| `chain_lab_steps` | position, name, input, output, caption count, prompt, model |
| `chain_lab_runs` | a run of a chain on an image: status, final captions/text |
| `chain_lab_run_steps` | each step of a run: a snapshot of the step, the prompt sent, model, output, latency |

Step positions stay 1..n with no gaps: new steps are placed by a trigger, deletes are compacted by a trigger, and `chain_lab_move_step(step, position)` reorders (the unique `(chain_id, position)` constraint is deferred so positions can shuffle in one transaction). Runs snapshot their steps, so editing a chain never rewrites past runs.

These are separate from Punchline's `prompt_chains`, which are caption styles whose steps are joined into a single model call.

## Local development

1. `npm install`
2. Create `.env`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
   GEMINI_API_KEY=<key from aistudio.google.com/apikey>
   ```
3. `npm run dev` → http://localhost:3002

Google sign-in needs this app's URL in Supabase → Authentication → URL Configuration → Redirect URLs (`http://localhost:3002/**` locally and `https://prompt-chain-tool*.vercel.app/**` in production).

## Deploying

Vercel project `prompt-chain-tool`, connected to this repo (pushes to `main` deploy to production). Set the three variables above in the project for every environment.
