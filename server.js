import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import express from 'express';

const APPFOLIO_CLIENT_ID = process.env.APPFOLIO_CLIENT_ID;
const APPFOLIO_CLIENT_SECRET = process.env.APPFOLIO_CLIENT_SECRET;
const APPFOLIO_DATABASE = process.env.APPFOLIO_DATABASE;

if (!APPFOLIO_CLIENT_ID || !APPFOLIO_CLIENT_SECRET || !APPFOLIO_DATABASE) {
  console.error('Missing required env vars: APPFOLIO_CLIENT_ID, APPFOLIO_CLIENT_SECRET, APPFOLIO_DATABASE');
  process.exit(1);
}

const AVAILABLE_REPORTS = [
  { name: 'rent_roll', description: 'Current rent roll across all properties' },
  { name: 'delinquency', description: 'Outstanding balances and late tenants' },
  { name: 'owner_statement', description: 'Financial summary by owner' },
  { name: 'lease_expiration', description: 'Upcoming lease expirations' },
  { name: 'unit_vacancy', description: 'Vacant units and vacancy rates' },
  { name: 'move_in_move_out', description: 'Move-in and move-out activity' },
  { name: 'work_orders', description: 'Maintenance work orders' },
  { name: 'bank_account_activity', description: 'Bank account transactions' },
  { name: 'cash_flow', description: 'Cash flow statement' },
  { name: 'general_ledger', description: 'General ledger detail' },
  { name: 'income_statement', description: 'Profit and loss statement' },
  { name: 'balance_sheet', description: 'Balance sheet' },
  { name: 'accounts_payable', description: 'Outstanding payables' },
  { name: 'accounts_receivable', description: 'Outstanding receivables' },
  { name: 'transaction_detail', description: 'Detailed transaction history' },
  { name: 'budget_vs_actual', description: 'Budget vs actual comparison' },
  { name: 'tenant_directory', description: 'Tenant contact directory' },
];

async function fetchAppFolioReport(reportName, params = {}) {
  const url = `https://${APPFOLIO_DATABASE}.appfolio.com/api/v2/reports/${reportName}.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${APPFOLIO_CLIENT_ID}:${APPFOLIO_CLIENT_SECRET}`).toString('base64'),
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AppFolio API error ${response.status}: ${text}`);
  }
  return response.json();
}

function createMcpServer() {
  const server = new McpServer({ name: 'appfolio', version: '1.0.0' });

  server.tool(
    'list_appfolio_reports',
    'List all available AppFolio report types you can fetch.',
    {},
    async () => ({
      content: [{
        type: 'text',
        text: AVAILABLE_REPORTS.map(r => `- ${r.name}: ${r.description}`).join('\n'),
      }],
    })
  );

  server.tool(
    'get_appfolio_report',
    'Fetch a report from AppFolio by name. Returns the full report data.',
    {
      report_name: z.string().describe('Report name, e.g. rent_roll, delinquency, owner_statement.'),
      params: z.record(z.any()).optional().describe('Optional filters e.g. { "start_date": "2026-01-01", "end_date": "2026-06-30" }'),
    },
    async ({ report_name, params }) => {
      try {
        const data = await fetchAppFolioReport(report_name, params || {});
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AppFolio MCP server running on port ${PORT}`));
