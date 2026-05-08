## app-brain-health

Protected eOS Head: **Brain Health / Sync Admin**.

### Setup

Create `app-brain-health/.env.local`:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_BACKEND_URL=http://localhost:3001
```

### Run

```bash
cd app-brain-health
npm install
npm run dev
```

Then open the Vite URL and sign in.

Only roles `admin` and `executive` are allowed.

