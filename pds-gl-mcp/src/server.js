// PDS general-ledger tools.
//
// Source of truth is `journal_entry_lines` — the QuickBooks GL synced into
// Supabase (2018 → present, ~125k lines, 168 accounts). Sign conventions follow
// the ledger, not the report:
//   revenue  = credit - debit   (credit-normal accounts)
//   expense  = debit  - credit  (debit-normal accounts)
// so every tool reports positive numbers for "money in" and "money out"
// respectively, and callers never have to reason about debits.
//
// `class` carries the department dimension (Condition Report / Photography /
// Detail), which is what makes gl_unit_economics possible: it lines the GL up
// against connecteam_form_submissions, which lives in this same database.

import { z } from 'zod';
import { query, ok, guard, money } from './db.js';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// Revenue and expense both expressed as positive magnitudes.
const REVENUE = `SUM(COALESCE(credit,0) - COALESCE(debit,0))`;
const EXPENSE = `SUM(COALESCE(debit,0) - COALESCE(credit,0))`;

// Department names in the GL are verbose ("Condition Report Department");
// match them loosely so callers can pass "photography" or "CR".
function classFilter(department, params) {
  if (!department) return '';
  params.push(`%${department}%`);
  return ` AND class ILIKE $${params.length}`;
}

export function registerTools(server) {
  // ---------------------------------------------------------------- health
  server.tool(
    'gl_health',
    'Verify the ledger connection and report coverage: line count, date range, and how stale the data is. Start here when a number looks wrong — the GL is only as current as the last QuickBooks sync, and PDS imports bank activity at month end.',
    {},
    guard(async () => {
      const [row] = await query(`
        SELECT COUNT(*)::int lines,
               MIN(date) first_txn,
               MAX(date) last_txn,
               COUNT(DISTINCT account)::int accounts,
               MAX(created_at) last_sync
        FROM journal_entry_lines
      `);
      const staleDays = row.last_txn
        ? Math.floor((Date.now() - new Date(row.last_txn).getTime()) / 86_400_000)
        : null;
      return ok({
        connected: true,
        ...row,
        daysSinceLastTransaction: staleDays,
        note:
          'Bank activity is imported from statements at month end, so a gap of a few weeks at the end of the range is expected, not a broken sync. Invoiced revenue is entered directly in QuickBooks and is current.',
      });
    }),
  );

  // ------------------------------------------------------------------ P&L
  server.tool(
    'gl_pnl',
    'Profit & loss for a period: revenue, COGS, gross profit, operating expenses and net income. Set monthly:true for a month-by-month trend, or byDepartment:true to split across the Condition Report / Photography / Detail departments. This is the right tool for "how did we do in August" or "which department actually makes money".',
    {
      startDate: DATE,
      endDate: DATE,
      monthly: z.boolean().optional().describe('Break the period out by month'),
      byDepartment: z.boolean().optional().describe('Split by GL class (department)'),
      department: z.string().optional().describe('Filter to one department, e.g. "Photography"'),
    },
    guard(async ({ startDate, endDate, monthly, byDepartment, department }) => {
      const params = [startDate, endDate];
      const where = `WHERE date BETWEEN $1 AND $2${classFilter(department, params)}`;

      const dims = [];
      if (monthly) dims.push(`to_char(date,'YYYY-MM') AS month`);
      if (byDepartment) dims.push(`COALESCE(NULLIF(class,''),'(unclassified)') AS department`);
      const select = dims.length ? dims.join(', ') + ',' : '';
      const groupBy = dims.length
        ? 'GROUP BY ' + dims.map((_, i) => i + 1).join(', ') + ' ORDER BY 1'
        : '';

      const rows = await query(
        `SELECT ${select}
           ${REVENUE} FILTER (WHERE classification = 'Revenue')                    AS revenue,
           ${EXPENSE} FILTER (WHERE account_type   = 'Cost of Goods Sold')         AS cogs,
           ${EXPENSE} FILTER (WHERE account_type IN ('Expense','Other Expense'))   AS opex
         FROM journal_entry_lines ${where} ${groupBy}`,
        params,
      );

      const shape = (r) => {
        const revenue = money(r.revenue);
        const cogs = money(r.cogs);
        const opex = money(r.opex);
        const grossProfit = money(revenue - cogs);
        return {
          ...(r.month ? { month: r.month } : {}),
          ...(r.department ? { department: r.department } : {}),
          revenue,
          cogs,
          grossProfit,
          grossMarginPct: revenue ? Math.round((grossProfit / revenue) * 1000) / 10 : null,
          opex,
          netIncome: money(grossProfit - opex),
        };
      };

      return ok({
        period: { startDate, endDate },
        ...(department ? { departmentFilter: department } : {}),
        ...(dims.length ? { rows: rows.map(shape) } : shape(rows[0] ?? {})),
      });
    }),
  );

  // -------------------------------------------------------- trial balance
  server.tool(
    'gl_trial_balance',
    'Net movement per account over a period, grouped by classification (Asset / Liability / Equity / Revenue / Expense). Use it to see which accounts actually moved before drilling into one with gl_account_detail.',
    {
      startDate: DATE,
      endDate: DATE,
      classification: z
        .enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'])
        .optional(),
      minAbsAmount: z.number().optional().describe('Hide accounts whose net movement is smaller than this'),
    },
    guard(async ({ startDate, endDate, classification, minAbsAmount = 0 }) => {
      const params = [startDate, endDate];
      let where = `WHERE date BETWEEN $1 AND $2`;
      if (classification) {
        params.push(classification);
        where += ` AND classification = $${params.length}`;
      }
      const rows = await query(
        `SELECT account, account_type, classification,
                COUNT(*)::int lines,
                SUM(COALESCE(debit,0))  AS debits,
                SUM(COALESCE(credit,0)) AS credits
         FROM journal_entry_lines ${where}
         GROUP BY account, account_type, classification
         ORDER BY ABS(SUM(COALESCE(debit,0) - COALESCE(credit,0))) DESC`,
        params,
      );
      const accounts = rows
        .map((r) => {
          const debits = money(r.debits);
          const credits = money(r.credits);
          // Report each account in its natural direction.
          const creditNormal = r.classification === 'Revenue' || r.classification === 'Liability' || r.classification === 'Equity';
          return {
            account: r.account,
            accountType: r.account_type,
            classification: r.classification,
            lines: r.lines,
            debits,
            credits,
            net: money(creditNormal ? credits - debits : debits - credits),
          };
        })
        .filter((a) => Math.abs(a.net) >= minAbsAmount);
      return ok({ period: { startDate, endDate }, accounts: accounts.length, rows: accounts });
    }),
  );

  // ------------------------------------------------------- account detail
  server.tool(
    'gl_account_detail',
    'Every transaction hitting one account over a date range — date, type, name, memo, debit/credit. Account matching is fuzzy, so "payroll" or "6100" both work. Use this to answer "what is actually in this expense account".',
    {
      account: z.string().describe('Account name or number, matched loosely'),
      startDate: DATE,
      endDate: DATE,
      limit: z.number().int().min(1).max(500).optional(),
    },
    guard(async ({ account, startDate, endDate, limit = 200 }) => {
      const rows = await query(
        `SELECT date, type, number, name, vendor, customer, class, memo, account,
                COALESCE(debit,0) debit, COALESCE(credit,0) credit
         FROM journal_entry_lines
         WHERE account ILIKE $1 AND date BETWEEN $2 AND $3
         ORDER BY date DESC, entry_number
         LIMIT $4`,
        [`%${account}%`, startDate, endDate, limit],
      );
      const [totals] = await query(
        `SELECT COUNT(*)::int lines,
                SUM(COALESCE(debit,0)) debits, SUM(COALESCE(credit,0)) credits
         FROM journal_entry_lines
         WHERE account ILIKE $1 AND date BETWEEN $2 AND $3`,
        [`%${account}%`, startDate, endDate],
      );
      return ok({
        accountFilter: account,
        period: { startDate, endDate },
        totals: {
          lines: totals.lines,
          debits: money(totals.debits),
          credits: money(totals.credits),
          net: money(Number(totals.debits ?? 0) - Number(totals.credits ?? 0)),
        },
        truncated: totals.lines > rows.length,
        entries: rows.map((r) => ({
          date: r.date,
          type: r.type,
          number: r.number,
          name: r.name,
          vendor: r.vendor,
          customer: r.customer,
          department: r.class,
          memo: r.memo,
          account: r.account,
          debit: money(r.debit),
          credit: money(r.credit),
        })),
      });
    }),
  );

  // ---------------------------------------------------------- transactions
  server.tool(
    'gl_transactions',
    'Free-form search across the ledger — filter by date, vendor, customer, department, transaction type, account, memo text, or minimum amount. Use when you are hunting for something specific ("all Home Depot charges over $500") rather than summarising.',
    {
      startDate: DATE,
      endDate: DATE,
      vendor: z.string().optional(),
      customer: z.string().optional(),
      department: z.string().optional(),
      type: z.string().optional().describe('Transaction type, e.g. Bill, Invoice, Check'),
      account: z.string().optional(),
      search: z.string().optional().describe('Text matched against memo, name and account'),
      minAmount: z.number().optional().describe('Minimum absolute amount'),
      limit: z.number().int().min(1).max(500).optional(),
    },
    guard(async (a) => {
      const params = [a.startDate, a.endDate];
      let where = `WHERE date BETWEEN $1 AND $2`;
      const like = (col, val) => {
        if (!val) return;
        params.push(`%${val}%`);
        where += ` AND ${col} ILIKE $${params.length}`;
      };
      like('vendor', a.vendor);
      like('customer', a.customer);
      like('class', a.department);
      like('type', a.type);
      like('account', a.account);
      if (a.search) {
        params.push(`%${a.search}%`);
        where += ` AND (memo ILIKE $${params.length} OR name ILIKE $${params.length} OR account ILIKE $${params.length})`;
      }
      if (a.minAmount) {
        params.push(a.minAmount);
        where += ` AND ABS(COALESCE(debit,0) - COALESCE(credit,0)) >= $${params.length}`;
      }
      params.push(a.limit ?? 100);
      const rows = await query(
        `SELECT date, type, number, name, vendor, customer, class, memo, account,
                COALESCE(debit,0) debit, COALESCE(credit,0) credit
         FROM journal_entry_lines ${where}
         ORDER BY date DESC, ABS(COALESCE(debit,0)-COALESCE(credit,0)) DESC
         LIMIT $${params.length}`,
        params,
      );
      return ok({
        period: { startDate: a.startDate, endDate: a.endDate },
        returned: rows.length,
        entries: rows.map((r) => ({
          date: r.date,
          type: r.type,
          number: r.number,
          name: r.name,
          vendor: r.vendor,
          customer: r.customer,
          department: r.class,
          memo: r.memo,
          account: r.account,
          amount: money(Number(r.debit) - Number(r.credit)),
        })),
      });
    }),
  );

  // --------------------------------------------------------- vendor spend
  server.tool(
    'gl_vendor_spend',
    'Total spend per vendor over a period, ranked. The fastest way to find where the money goes and which vendors are worth renegotiating.',
    { startDate: DATE, endDate: DATE, limit: z.number().int().min(1).max(200).optional() },
    guard(async ({ startDate, endDate, limit = 25 }) => {
      const rows = await query(
        `SELECT COALESCE(NULLIF(vendor,''), NULLIF(name,''), '(unnamed)') vendor,
                COUNT(*)::int lines, ${EXPENSE} AS spend
         FROM journal_entry_lines
         WHERE date BETWEEN $1 AND $2 AND classification = 'Expense'
         GROUP BY 1 HAVING ${EXPENSE} > 0
         ORDER BY spend DESC LIMIT $3`,
        [startDate, endDate, limit],
      );
      const total = rows.reduce((s, r) => s + money(r.spend), 0);
      return ok({
        period: { startDate, endDate },
        totalShown: money(total),
        vendors: rows.map((r) => ({ vendor: r.vendor, lines: r.lines, spend: money(r.spend) })),
      });
    }),
  );

  // ------------------------------------------------------ customer revenue
  server.tool(
    'gl_customer_revenue',
    'Revenue per customer over a period, ranked — e.g. how much Manheim Dallas vs Cox Automotive is actually worth. Revenue is recognised from invoices, which are entered directly in QuickBooks, so this is current even when bank activity is not.',
    { startDate: DATE, endDate: DATE, limit: z.number().int().min(1).max(200).optional() },
    guard(async ({ startDate, endDate, limit = 25 }) => {
      const rows = await query(
        `SELECT COALESCE(NULLIF(customer,''), NULLIF(name,''), '(unnamed)') customer,
                COUNT(*)::int lines, ${REVENUE} AS revenue
         FROM journal_entry_lines
         WHERE date BETWEEN $1 AND $2 AND classification = 'Revenue'
         GROUP BY 1 HAVING ${REVENUE} <> 0
         ORDER BY revenue DESC LIMIT $3`,
        [startDate, endDate, limit],
      );
      return ok({
        period: { startDate, endDate },
        customers: rows.map((r) => ({
          customer: r.customer,
          lines: r.lines,
          revenue: money(r.revenue),
        })),
      });
    }),
  );

  // --------------------------------------------------------- cash position
  server.tool(
    'gl_cash_position',
    'Balance of every cash/bank account as of a date, computed from ledger movement. Remember bank activity lands via month-end statement imports, so this reflects the last import, not live banking.',
    { asOf: DATE },
    guard(async ({ asOf }) => {
      const rows = await query(
        `SELECT account, SUM(COALESCE(debit,0) - COALESCE(credit,0)) balance,
                MAX(date) last_activity
         FROM journal_entry_lines
         WHERE date <= $1 AND (is_cash_account IS TRUE OR account_type = 'Bank')
         GROUP BY account ORDER BY balance DESC`,
        [asOf],
      );
      const accounts = rows.map((r) => ({
        account: r.account,
        balance: money(r.balance),
        lastActivity: r.last_activity,
      }));
      return ok({
        asOf,
        totalCash: money(accounts.reduce((s, a) => s + a.balance, 0)),
        accounts,
      });
    }),
  );

  // -------------------------------------------------------- unit economics
  server.tool(
    'gl_unit_economics',
    'The one that ties dollars to cars: GL revenue per department against the number of units actually logged in Connecteam over the same period, giving revenue per unit. Departments map to submission types (Condition Report ↔ CRs, Photography ↔ photo sets). Use it for "what is a CR worth" or "is photography carrying its weight", and to spot billed-vs-produced gaps.',
    {
      startDate: DATE,
      endDate: DATE,
      monthly: z.boolean().optional().describe('Break out by month'),
    },
    guard(async ({ startDate, endDate, monthly }) => {
      const bucket = monthly ? `to_char(date,'YYYY-MM')` : `'total'`;
      const revenue = await query(
        `SELECT ${bucket} AS period,
                COALESCE(NULLIF(class,''),'(unclassified)') department,
                ${REVENUE} AS revenue
         FROM journal_entry_lines
         WHERE date BETWEEN $1 AND $2 AND classification = 'Revenue'
         GROUP BY 1,2 ORDER BY 1,2`,
        [startDate, endDate],
      );

      const subBucket = monthly ? `to_char(submission_date,'YYYY-MM')` : `'total'`;
      const units = await query(
        `SELECT ${subBucket} AS period,
                COALESCE(NULLIF(submission_type,''),'(untyped)') submission_type,
                COUNT(*)::int units
         FROM connecteam_form_submissions
         WHERE submission_date BETWEEN $1 AND $2 AND deleted_at IS NULL
         GROUP BY 1,2 ORDER BY 1,2`,
        [startDate, endDate],
      );

      // Department → submission-type matcher. Kept here rather than in SQL so
      // the mapping is visible and easy to correct as service types change.
      const DEPT_MATCH = [
        { department: /condition report/i, matches: /condition report/i },
        { department: /photograph/i, matches: /photo/i },
        { department: /detail/i, matches: /detail/i },
      ];

      const periods = [...new Set([...revenue, ...units].map((r) => r.period))].sort();
      const rows = periods.map((period) => {
        const revs = revenue.filter((r) => r.period === period);
        const uns = units.filter((u) => u.period === period);
        const departments = revs
          .filter((r) => r.department !== '(unclassified)')
          .map((r) => {
            const rule = DEPT_MATCH.find((d) => d.department.test(r.department));
            const matched = rule ? uns.filter((u) => rule.matches.test(u.submission_type)) : [];
            const unitCount = matched.reduce((s, u) => s + u.units, 0);
            const rev = money(r.revenue);
            return {
              department: r.department,
              revenue: rev,
              units: unitCount,
              revenuePerUnit: unitCount ? money(rev / unitCount) : null,
              matchedSubmissionTypes: matched.map((m) => m.submission_type),
            };
          });
        return {
          period,
          departments,
          unmatchedRevenue: money(
            revs.filter((r) => r.department === '(unclassified)').reduce((s, r) => s + money(r.revenue), 0),
          ),
          totalUnits: uns.reduce((s, u) => s + u.units, 0),
        };
      });

      return ok({
        period: { startDate, endDate },
        note:
          'Revenue comes from the GL (class = department); units come from connecteam_form_submissions. A department showing revenue with zero units — or units with no revenue — usually means the invoice period and the production period do not line up, or a location is not syncing.',
        rows: monthly ? rows : rows[0],
      });
    }),
  );
}
