#!/usr/bin/env node
// Local stdio transport — for Claude Desktop / Claude Code MCP configs that
// launch the server as a subprocess. The hosted HTTP entry point lives in
// app/m/<secret>/[transport]/route.js.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './server.js';

if (!process.env.PDS_DATABASE_URL) {
  console.error('PDS_DATABASE_URL is not set. Export it or pass it via the MCP config env.');
  process.exit(1);
}

const server = new McpServer({ name: 'pds-gl', version: '0.1.0' });
registerTools(server);

await server.connect(new StdioServerTransport());
