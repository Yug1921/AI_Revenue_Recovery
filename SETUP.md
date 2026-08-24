# Setup — do this once, in order

## 1. Create the repo
```bash
mkdir recovery-agent
cd recovery-agent
git init
```
Drop `PROJECT_CONTEXT.md` (the spec file from earlier) into this root folder — keep it there,
it's the reference doc for every task.

Open this folder in VS Code: `code .`

## 2. Backend folder + Python environment
```bash
mkdir -p backend/app/db backend/app/synthetic
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
```
Copy in `requirements.txt`, then:
```bash
pip install -r requirements.txt
```

## 3. Environment variables
Copy `.env.example` to `.env` and fill in the two Supabase values (Project Settings → API in
your Supabase dashboard: Project URL and the `service_role` key — use service_role, not anon,
since this backend writes data server-side).
```bash
cp .env.example .env
```
**Never commit `.env`.** Add it to `.gitignore`:
```bash
echo "venv/" >> .gitignore
echo ".env" >> .gitignore
echo "__pycache__/" >> .gitignore
```

## 4. Create the database tables
Open your Supabase project → SQL Editor → paste the contents of `app/db/schema.sql` → Run.
This creates `transactions`, `diagnoses`, `decisions`, `actions`, `batch_runs` exactly as
specified in the project context file. Do this once; re-run only if you change the schema.

## 5. Run Task A — generate synthetic data
```bash
python -m app.synthetic.generate
```
This seeds ~60 synthetic transaction records into Supabase, split across the three failure
types and every root-cause bucket from the decision table, tagged with a fresh `batch_id`.
It prints the `batch_id` at the end — save it, you'll need it for Tasks B/C/D.

Check Supabase → Table Editor → `transactions` to confirm rows landed.

That's Task A done. Everything after this (diagnosis engine, decision engine, execution agent)
reads from this seeded batch.
