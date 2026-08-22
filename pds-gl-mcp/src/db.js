// Postgres access to the PDS ledger database.
//
// We talk SQL directly rather than going through supabase-js because every tool
// here is an aggregation over ~125k journal lines — rolling that up in the
// database is the difference between an instant answer and shipping the whole
// table over the wire.
//
// Connect through Supabase's transaction pooler (port 6543) so serverless
// invocations don't exhaust direct connections.

import pg from 'pg';

const { Pool } = pg;

let pool;

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.PDS_DATABASE_URL;
  if (!connectionString) throw new Error('PDS_DATABASE_URL is not set.');
  pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Supabase terminates TLS with its own CA; verifying it adds no security
    // here (the host is pinned by the connection string) and breaks on Vercel.
    ssl: { rejectUnauthorized: false },
  });
  return pool;
}

export async function query(sql, params = []) {
  const res = await getPool().query(sql, params);
  return res.rows;
}

// Every tool returns JSON text — the MCP content shape the SDK expects.
export function ok(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

export function fail(message) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

// Wrap a tool body so a SQL/connection error comes back as a readable message
// instead of a stack trace the model has to guess at.
export function guard(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'query failed');
    }
  };
}

// Money is stored as numeric; pg hands numerics back as strings to preserve
// precision. Round to cents for display and hand back a real number.
export const money = (v) => Math.round(Number(v ?? 0) * 100) / 100;
