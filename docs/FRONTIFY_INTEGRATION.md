# Frontify integration guide

This guide walks you through connecting Heimdall to Frontify so that when a Monday item is set to **Approved**, the Assets column is filled with the Frontify URL (and optionally a folder is created in Frontify).

---

## 1. (Optional) Get a Frontify API token

Only needed if you want **folder creation or folder existence check** in Frontify. For just writing the URL to Monday, skip to step 2.

Frontify exposes the token **through an application**, not as a standalone “create token” button.

1. **Open Apps** (you’re already there: the page where you see “Add application”, “Private apps”, “Public apps”).
2. **Click “Add application”** and create a new **Private** app (e.g. name it “Heimdall” or “Monday integration”).
3. **Open the new app** (click its name in the Private apps list).
4. **Find the token** in the app’s details:
   - Look for **Access token**, **API token**, **Client secret**, or **Token**.
   - It may be under a “Credentials” or “Settings” tab. Copy it immediately; some UIs show it only once.
5. If you don’t see a token, check **Access management** (sidebar) for token or app credentials, or use the app’s **Scopes** and ensure it has access to **Libraries** (read/write for folder creation).

If no token is shown anywhere for the app, your Frontify plan may restrict API tokens to certain roles—contact your Frontify admin or support.

---

## 2. Set environment variables

In your `.env` (or Vercel/hosting env), set:

```env
# Required for the Assets link URL to be written to Monday
MONDAY_ASSETS_COLUMN_ID=link_here    # from step 4 below
MONDAY_ASSETS_STATUS_APPROVED=Approved   # or "Brief ready / approved" to match your board

# Frontify – URL is built from domain + path; token only needed for folder check/create
FRONTIFY_DOMAIN=loop.frontify.com
FRONTIFY_DOCUMENT_PATH=document/12
# Optional: only needed if you want folder creation or existence check in Frontify
# FRONTIFY_ACCESS_TOKEN=your_token_here
```

**Optional (for folder creation in Frontify):**

```env
FRONTIFY_LIBRARY_ID=your_library_id
```

- **`FRONTIFY_DOMAIN`** – Your Frontify host, e.g. `loop.frontify.com` (no `https://`).
- **`FRONTIFY_DOCUMENT_PATH`** – The path used in the share link (e.g. `document/12`). Linsey confirmed this is always the same for your experiment links.
- **`FRONTIFY_LIBRARY_ID`** – Only needed if you want Heimdall to **create or check folders** in Frontify. If you leave it empty, the **URL is still generated and written to Monday**; only the folder check/create is skipped.

---

## 3. Find the Monday “Assets” column ID

1. Log in to the Heimdall admin (same auth as your app).
2. Call:
   ```http
   GET /api/admin/monday/columns?boardId=18404406006
   ```
   (Use your board ID; with cookies so you’re authenticated.)
3. In the response, find the column whose **title** is “Assets” and note its **id** (e.g. `link0` or `text3`).
4. Set in `.env`:
   ```env
   MONDAY_ASSETS_COLUMN_ID=link0
   ```

---

## 4. (Optional) Find the Frontify Library ID

You only need this if you want **folder creation** or **folder existence check** in Frontify.

1. **From the Frontify UI**  
   - Open the Library that contains your experiment assets.  
   - The URL often looks like: `https://loop.frontify.com/library/12345` or similar. The number may be the library ID, but the **API** sometimes uses a different (global) ID.

2. **From the GraphQL API**  
   - In [Frontify GraphQL Explorer](https://frontify.github.io/public-api-explorer/) (logged in), run:
     ```graphql
     query { projects { id name } }
     ```
     or query that returns **libraries** and note the **id** of the library you use for experiments.

3. Set in `.env`:
   ```env
   FRONTIFY_LIBRARY_ID=your_library_id
   ```

If you omit `FRONTIFY_LIBRARY_ID`, the integration still:
- Builds the Frontify URL from the item name.
- Writes that URL into the Monday Assets column when status is Approved.

---

## 5. Monday webhook (reminder)

Ensure your Monday board sends events to Heimdall:

1. **Board** → **Integrations** → **Webhooks** (or Automations that call a webhook).
2. **URL:** `https://your-heimdall-domain.com/api/webhooks/monday`
3. **Events:**  
   - **Create item** (`create_pulse`) – so new items can get the link when they’re later set to Approved.  
   - **Status change** / **Update** – so when an item is set to **Approved**, Heimdall can fill the Assets column.

If you only care about “when status becomes Approved”, the **status change** subscription is enough.

---

## 6. Test the flow

1. Restart the app (or deploy) so it picks up the new env vars.
2. In Monday, create or use an item whose **name** is the experiment code (e.g. `EXP-LM179`).
3. Set the item’s **status** to the value you set in `MONDAY_ASSETS_STATUS_APPROVED` (e.g. **Approved**).
4. Check the **Assets** column – it should get:
   `https://loop.frontify.com/document/12?q=EXP-LM179`
5. If you set `FRONTIFY_LIBRARY_ID`, check Frontify (or logs) to see whether the folder was created or already existed.

---

## Summary

| Goal                         | What you need |
|-----------------------------|----------------|
| Only add Frontify URL to Monday | `MONDAY_ASSETS_COLUMN_ID`, `MONDAY_ASSETS_STATUS_APPROVED`, `FRONTIFY_DOMAIN`, `FRONTIFY_DOCUMENT_PATH`. No Frontify token needed. |
| Also check/create folders   | Above + `FRONTIFY_ACCESS_TOKEN` + `FRONTIFY_LIBRARY_ID`. |

The URL is built from the **item name** (e.g. `EXP-LM179`), so naming in Monday must match the convention you use in Frontify.
