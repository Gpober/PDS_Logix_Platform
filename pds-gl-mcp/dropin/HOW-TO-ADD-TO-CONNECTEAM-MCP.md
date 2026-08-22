# Adding the GL tools to the existing Connecteam MCP

Nothing new to deploy — this bolts onto the connector you already have. The
Connecteam MCP is already organised as "register a group of tools per module",
so the GL is just a third module beside users/hours and production.

## 1. Copy two files

Into `connecteam-mcp/src/` in the `pdsLogix` repo:

```
gl.js        # the nine GL tools
gl-db.js     # Postgres pool + helpers
```

## 2. Add the dependency

`connecteam-mcp/package.json` — the GL tools talk to Postgres directly (the
existing tools use the Connecteam REST API and supabase-js, neither of which
can aggregate 125k journal lines in one round trip):

```jsonc
"dependencies": {
  "pg": "^8.13.1",
  // ...everything already there
}
```

## 3. Register the tools — one import, one call

In `connecteam-mcp/app/m/<secret>/[transport]/route.js`:

```js
import { registerGlTools } from '../../../../src/gl.js';   // ← add

const handler = createMcpHandler(
  (server) => {
    registerTools(server, process.env.CONNECTEAM_API_KEY);
    registerProductionTools(server);
    registerGlTools(server);                                // ← add
  },
  // ...
);
```

Do the same in `src/stdio.js` if you use the local stdio transport.

## 4. Set one env var

In the **connecteam-mcp** Vercel project → Settings → Environment Variables:

```
PDS_DATABASE_URL = postgresql://postgres.<ref>:<password>@aws-0-us-east-2.pooler.supabase.com:6543/postgres
```

Get it from Supabase → **PDS Lgix** project → Project Settings → Database →
Connection string → **Transaction** (port 6543 — the pooler, so serverless
invocations don't exhaust direct connections).

## 5. Redeploy

Same connector URL, same secret path. Nine new tools appear next to the
Connecteam ones:

`gl_health` · `gl_pnl` · `gl_trial_balance` · `gl_account_detail` ·
`gl_transactions` · `gl_vendor_spend` · `gl_customer_revenue` ·
`gl_cash_position` · `gl_unit_economics`

## Why this pairs well with what's already there

`connecteam_production_report` counts cars. `gl_pnl` counts dollars. With both
on one connector, `gl_unit_economics` can answer "what is a CR actually worth"
in a single call — it reads GL revenue by department and Connecteam submission
counts, and both live in the same `PDS Lgix` database.
