// Hosted MCP endpoint.
//
// The random path segment IS the access control — the ledger is readable by
// anyone holding this URL, so treat it as a secret (same arrangement as the
// Connecteam MCP). Rotate by renaming this directory and re-adding the
// connector.

import { createMcpHandler } from 'mcp-handler';
import { registerTools } from '../../../../src/server.js';

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {},
  { basePath: '/m/9ede0120454ac08a47a02062cdc34425' },
);

export { handler as GET, handler as POST, handler as DELETE };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// GL aggregations over ~125k lines are fast, but a cold pool connect plus a
// wide date range can run long; give it room.
export const maxDuration = 60;
