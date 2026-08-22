// Smoke test: boots the server in-process, lists the tools, and runs a couple
// of read-only calls against the real ledger. Requires PDS_DATABASE_URL.
//
//   node scripts/smoke.js

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../src/server.js';

let failures = 0;
const check = (label, condition) => {
  console.log(`${condition ? '✅' : '❌'} ${label}`);
  if (!condition) failures++;
};

const server = new McpServer({ name: 'pds-gl', version: '0.1.0' });
registerTools(server);

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'smoke', version: '0.1.0' });
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
console.log(`\nTools: ${names.join(', ')}\n`);
for (const expected of [
  'gl_health',
  'gl_pnl',
  'gl_trial_balance',
  'gl_account_detail',
  'gl_transactions',
  'gl_vendor_spend',
  'gl_customer_revenue',
  'gl_cash_position',
  'gl_unit_economics',
]) {
  check(`registered ${expected}`, names.includes(expected));
}

const call = async (name, args) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? '';
  return { res, json: JSON.parse(text) };
};

const health = await call('gl_health', {});
check('gl_health connects', health.json.connected === true && health.json.lines > 0);
console.log(`   ${health.json.lines} lines, ${health.json.first_txn} → ${health.json.last_txn}`);

const pnl = await call('gl_pnl', { startDate: '2026-01-01', endDate: '2026-12-31' });
check('gl_pnl returns revenue', typeof pnl.json.revenue === 'number');
console.log(`   2026 revenue ${pnl.json.revenue}, gross margin ${pnl.json.grossMarginPct}%`);

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
