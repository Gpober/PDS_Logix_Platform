# PDS GL MCP

An MCP server that exposes the **PDS general ledger** — the QuickBooks GL synced
into the `PDS Lgix` Supabase project (~125k journal lines, 2018 → present, 168
accounts) — as clean tools instead of raw SQL.

It follows the same shape as the Connecteam MCP: read from the **synced
database**, never a live API scan, so answers come back instantly and a wide
date range can't time out.

> Connector URL (treat as a secret — the random path segment *is* the access
> control): `https://<deployment>/m/<secret>/mcp`. The real path is in
> `app/m/*/[transport]/route.js`.

## Tools

| Tool | What it answers |
| --- | --- |
| `gl_health` | Is the ledger reachable, and how current is it? |
| `gl_pnl` | Revenue, COGS, gross profit, opex, net income — optionally by month and/or department. |
| `gl_trial_balance` | Which accounts actually moved over a period. |
| `gl_account_detail` | Every transaction inside one account. |
| `gl_transactions` | Free-form search: vendor, customer, department, type, memo text, minimum amount. |
| `gl_vendor_spend` | Where the money goes, ranked by vendor. |
| `gl_customer_revenue` | What each customer is worth (Manheim Dallas vs Cox, etc.). |
| `gl_cash_position` | Bank balances as of a date. |
| `gl_unit_economics` | **Dollars per car** — GL revenue by department against units logged in Connecteam. |

### Sign conventions

The ledger stores debits and credits; the tools do the translation so callers
never have to:

- revenue = `credit - debit` (credit-normal)
- expense = `debit - credit` (debit-normal)

Both come back as positive magnitudes — "money in" and "money out".

### Two data-freshness facts worth knowing

1. **Invoiced revenue is current.** Invoices are entered directly in
   QuickBooks, so revenue does not wait on anything.
2. **Bank activity lags.** PDS's bank is *not* connected to QuickBooks —
   statements are imported at month end. A few weeks of missing bank lines at
   the end of the range is expected, not a broken sync. `gl_health` reports the
   gap explicitly.

## Setup

### 1. Connection string

`PDS_DATABASE_URL` must point at the `PDS Lgix` Supabase project. Use the
**transaction pooler** string (port `6543`) so serverless invocations don't
exhaust direct connections:

> Supabase → Project Settings → Database → Connection string → **Transaction**

```
postgresql://postgres.<ref>:<password>@aws-0-us-east-2.pooler.supabase.com:6543/postgres
```

Keep it in Vercel env vars (or your MCP config `env` block) — never in the repo.

### 2. Deploy

Deploy this folder as its own Vercel project (root directory `pds-gl-mcp`), set
`PDS_DATABASE_URL`, then add the connector URL in Claude:

```
https://<deployment>/m/<secret>/mcp
```

### 3. Or run locally over stdio

```jsonc
{
  "mcpServers": {
    "pds-gl": {
      "command": "node",
      "args": ["/path/to/pds-gl-mcp/src/stdio.js"],
      "env": { "PDS_DATABASE_URL": "postgresql://..." }
    }
  }
}
```

### 4. Verify

```bash
npm install
PDS_DATABASE_URL=postgresql://... npm run smoke
```

Checks that all nine tools register, that the ledger connects, and prints the
current-year revenue and gross margin.

## Rotating the secret path

Rename `app/m/<secret>/` to a fresh random segment, update the `basePath` in
`route.js` to match, redeploy, and re-add the connector. The old URL dies with
the deploy.

## Known mapping gap

`gl_unit_economics` maps GL departments to Connecteam submission types:

| Department | Submission types |
| --- | --- |
| Condition Report | `Condition Report`, `Condition Report (Frame)` |
| Photography | `7 Standard Photos`, `15+3 Photos`, and their retakes |
| Detail | *(none — detail work is not logged in Connecteam)* |

The Detail Department carries real revenue but has **no production units
recorded**, so its revenue-per-unit comes back `null`. That's a genuine gap in
operational tracking, not a bug. The mapping lives in `DEPT_MATCH` in
`src/server.js` — one place to correct as service types change.
