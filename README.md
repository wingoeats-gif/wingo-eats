# Wingo Eats — Dynamic Website Setup Guide (Cloudflare Workers)

This is the **Workers-native** version of the setup, for Cloudflare accounts
that don't show a classic "Pages" option (most new accounts as of mid-2026).
Everything works the same for you day-to-day — the admin panel, the login,
the restaurant/dish management — this just changes how the site gets
deployed and connected to the database.

---

## What changed from the Pages version

- The old `/functions` folder is gone. In its place: a single
  `worker/index.js` file that handles all `/api/...` requests, plus a
  `wrangler.jsonc` file that tells Cloudflare how to serve everything.
- The D1 database binding is now defined **in `wrangler.jsonc`** (one field
  you fill in once), not clicked together in the dashboard. This is more
  reliable — it deploys with your code every time instead of being a
  separate setting you could accidentally miss.
- Static pages (`index.html`, `/admin/*`, etc.) are still served exactly as
  before, automatically, with no configuration needed.

---

## Step 1 — Files on GitHub

Same as before: create a GitHub repo, upload every file and folder from
this project (including `.assetsignore`, `wrangler.jsonc`, `package.json`,
and the new `worker` folder) keeping the same folder structure, and commit.

If you previously uploaded the old version with a `/functions` folder,
delete that folder from the repo now — it's replaced by `/worker`.

---

## Step 2 — Create the database

1. Cloudflare dashboard → **Workers & Pages** → **D1 SQL Database** →
   **Create Database** → name it `wingoeats-db` → **Create**.
2. Click into it, open the **Console** tab, paste in the contents of
   `schema.sql`, and click **Execute**.
   - Copy from the **Raw** view if you're copying from GitHub, so line
     breaks come through correctly.
3. Still on the database's page, find **Database ID** (a long string like
   `a1b2c3d4-....`) and copy it — you'll need it in the next step.

---

## Step 3 — Fill in your database ID

Open `wrangler.jsonc` (either on GitHub directly — click the file, then the
pencil/edit icon — or in a text editor before uploading) and replace:

```
"database_id": "REPLACE-WITH-YOUR-DATABASE-ID"
```

with the Database ID you copied, e.g.:

```
"database_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

Save/commit the change.

---

## Step 4 — Create the Worker and connect GitHub

1. Cloudflare dashboard → **Workers & Pages** → **Create application**.
2. Click **Get started** next to **Import a repository**.
3. Sign in with GitHub if prompted, authorize Cloudflare, select your repo.
4. Cloudflare will detect the `wrangler.jsonc` file already in the repo —
   leave the build command blank (it isn't needed).
5. Click **Save and Deploy**.
6. Once it finishes, you'll get a URL like `your-project.workers.dev`.

If you land on a page saying **"No URLs enabled"**: go to your project's
**Settings → Domains & Routes**, and enable the **workers.dev** URL there
(or enable **Preview URLs** if that's what you see). Then revisit the URL.

---

## Step 5 — Confirm the database is connected

Because the binding lives in `wrangler.jsonc`, it should already be
connected after Step 4 — no extra dashboard clicking needed. To confirm:

1. Go to your project → **Settings → Bindings**.
2. You should see a **D1 Database** entry named `DB` pointing at
   `wingoeats-db`. If it's missing, double-check Step 3 (the database ID)
   was saved correctly and redeploy.

---

## Step 6 — Create your admin account

1. Visit `https://your-project.workers.dev/admin/login.html`.
2. You'll see **"Create Your Admin Account"** the first time — pick a
   username and password (8+ characters).
3. Click **Create Account & Log In**.

From then on, `/admin/login.html` shows a normal login form.

---

## Step 7 — Add a restaurant to test it

**+ Add Restaurant** → save → click the 🍔 icon → **+ Add Dish** → save →
open your homepage in a new tab to see it live.

---

## Optional — Your own domain (wingoeats.com)

Once the `.workers.dev` address works: your project → **Settings → Domains
& Routes** → **Add** → **Custom Domain** → enter `wingoeats.com` → follow
the prompts (automatic if the domain's DNS is already on Cloudflare).

---

## Troubleshooting

- **"No URLs enabled"** — enable the workers.dev URL under Settings →
  Domains & Routes (Step 4).
- **Login page says "Could not reach the server"** — the `DB` binding
  isn't connected. Check Step 3 (correct database ID in `wrangler.jsonc`,
  committed to GitHub) and Step 5, then redeploy.
- **Images/CSS/admin pages 404** — check that `.assetsignore` was uploaded
  to the repo root (without it, Cloudflare may try to publish `/worker`
  and config files as public pages, which isn't harmful but isn't
  intended either).
- **"Requests without any query are not supported"** in the D1 Console —
  a copy-paste stripped your line breaks, turning a `--` comment into one
  giant comment swallowing the whole script. Copy from GitHub's **Raw**
  file view instead, or remove comment lines before pasting.

---

## File structure

```
/
├── index.html / restaurant.html     Public pages
├── style.css / script.js / app.js    Shared styling & data fetching
├── /admin                              Login + admin dashboard (HTML/CSS/JS)
├── /worker
│   ├── index.js                          All /api/... routes (single entry point)
│   └── /lib                                Shared helpers (auth, base64)
├── wrangler.jsonc                       Worker + static assets + D1 config
├── package.json                          Lets Cloudflare resolve wrangler
├── .assetsignore                         Keeps worker/config files private
└── schema.sql                             Database structure — run once in Step 2
```

You'll only ever touch the admin panel in your browser day-to-day.
