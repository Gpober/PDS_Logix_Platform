'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/crm/data';
import {
  getWorkspaceGid,
  isAsanaConfigured,
  listProjects,
  listTasks,
  type AsanaTask,
} from './client';

export type SyncResult =
  | { ok: true; projects: number; tasks: number; deals: number; leads: number }
  | { ok: false; error: string };

// Pull every Asana project + its tasks and upsert into Supabase. Idempotent
// (keyed by Asana gid), so it doubles as the "futures" refresh — run it again
// any time. Owner/admin only.
export async function syncAsana(): Promise<SyncResult> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
    return { ok: false, error: 'Only an owner or admin can sync Asana.' };
  }
  if (!isAsanaConfigured()) {
    return { ok: false, error: 'ASANA_TOKEN is not set on the server.' };
  }

  const supabase = await createServerSupabase();

  try {
    const workspace = await getWorkspaceGid();
    const projects = await listProjects(workspace);

    // Preload lookups for turning per-creator project tasks into deals: existing
    // companies by name, and which talent each project belongs to.
    const { data: companyRows } = await supabase.from('companies').select('id, name');
    const companyByName = new Map<string, string>(
      ((companyRows as { id: string; name: string }[] | null) ?? []).map((c) => [
        c.name.toLowerCase(),
        c.id,
      ]),
    );
    const { data: talentRows } = await supabase
      .from('talent')
      .select('id, asana_project_gid')
      .not('asana_project_gid', 'is', null);
    const talentByProject = new Map<string, string>(
      ((talentRows as { id: string; asana_project_gid: string }[] | null) ?? []).map((t) => [
        t.asana_project_gid,
        t.id,
      ]),
    );

    const { data: allTalent } = await supabase.from('talent').select('id, name');
    const talentByName = new Map<string, string>(
      ((allTalent as { id: string; name: string }[] | null) ?? []).map((t) => [
        t.name.toLowerCase(),
        t.id,
      ]),
    );

    // Get (or create) a company id for a cleaned task title, caching within the
    // run. Asana deals come from brands, so new companies default to type 'brand'.
    async function ensureCompany(rawName: string): Promise<string | null> {
      const name = cleanBrand(rawName);
      const key = name.toLowerCase();
      const cached = companyByName.get(key);
      if (cached) return cached;
      const { data } = await supabase
        .from('companies')
        .insert({ name, type: 'brand' })
        .select('id')
        .single();
      const id = (data as { id: string } | null)?.id;
      if (id) companyByName.set(key, id);
      return id ?? null;
    }

    let taskTotal = 0;
    let dealTotal = 0;
    let leadTotal = 0;

    for (const p of projects) {
      const tasks = await listTasks(p.gid);
      taskTotal += tasks.length;
      const completed = tasks.filter((t) => t.completed).length;

      await supabase.from('asana_projects').upsert(
        {
          gid: p.gid,
          name: p.name,
          archived: p.archived ?? false,
          team_gid: p.team?.gid ?? null,
          owner_gid: p.owner?.gid ?? null,
          owner_name: p.owner?.name ?? null,
          num_tasks: tasks.length,
          num_completed_tasks: completed,
          num_incomplete_tasks: tasks.length - completed,
          created_at: p.created_at ?? null,
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'gid' },
      );

      if (tasks.length > 0) {
        await supabase
          .from('asana_tasks')
          .upsert(tasks.map((t) => taskRow(t, p.gid)), { onConflict: 'gid' });
      }

      // Turn the pitch-engine project's tasks into CRM leads, parsing the
      // "EMAIL:" / pitch context out of each task's notes. Keyed by the source
      // task so re-syncs refresh email + notes instead of duplicating.
      if (isLeadsProject(p.gid, p.name)) {
        const now = new Date();
        const leadRows = tasks
          .map((t) => {
            const notes = t.notes ?? '';
            const email = parseEmail(notes);
            if (!email) return null; // skips SOP / notes without a contact email
            const lastText = field(notes, 'LAST PITCH');
            const nextText = field(notes, 'NEXT ELIGIBLE');
            return {
              name: t.name,
              email,
              message: notes || null,
              source: 'asana:pitch-engine',
              created_at: t.created_at ?? null,
              asana_task_gid: t.gid,
              owner: field(notes, 'OWNER'),
              last_pitch_text: lastText,
              last_pitch_on: parseDateFromText(lastText, now),
              next_eligible_text: nextText,
              next_eligible_on: parseDateFromText(nextText, now),
              history: field(notes, 'HISTORY'),
              fit: field(notes, 'FIT'),
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (leadRows.length > 0) {
          await supabase.from('leads').upsert(leadRows, { onConflict: 'asana_task_gid' });
          leadTotal += leadRows.length;
        }
      }

      // Per-creator project (a talent is linked to it): each task is a brand
      // deal for that talent. Create/reuse the brand (cleaned name), then upsert
      // the deal keyed by its source task so re-syncs refresh instead of dupe.
      const talentId = talentByProject.get(p.gid);
      if (talentId) {
        const dealRows = [];
        for (const t of tasks) {
          const companyId = await ensureCompany(t.name);
          if (!companyId) continue;
          dealRows.push({
            company_id: companyId,
            talent_id: talentId,
            booking_date: t.due_on ?? (t.created_at ? t.created_at.slice(0, 10) : null),
            status: t.completed ? 'completed' : 'pitched',
            notes: t.name,
            asana_task_gid: t.gid,
          });
        }
        if (dealRows.length > 0) {
          await supabase.from('deals').upsert(dealRows, { onConflict: 'asana_task_gid' });
          dealTotal += dealRows.length;
        }
      }

      // Income tracker ("<Talent>'s Income Tracker"): each task is an invoiced
      // deal with a dollar breakdown. Enrich a matching deal or create one, then
      // store the owner-only financials and feed gross → budget (booked revenue).
      const trackerTalentId = incomeTrackerTalentId(p.name, talentByName);
      if (trackerTalentId) {
        for (const t of tasks) {
          const companyId = await ensureCompany(t.name);
          if (!companyId) continue;
          const fin = parseFinancials(t.notes);

          let dealId =
            (
              await supabase
                .from('deals')
                .select('id')
                .eq('income_task_gid', t.gid)
                .maybeSingle()
            ).data?.id ?? null;
          if (!dealId) {
            dealId =
              (
                await supabase
                  .from('deals')
                  .select('id')
                  .eq('talent_id', trackerTalentId)
                  .eq('company_id', companyId)
                  .is('income_task_gid', null)
                  .limit(1)
                  .maybeSingle()
              ).data?.id ?? null;
          }

          const payload = {
            talent_id: trackerTalentId,
            company_id: companyId,
            booking_date: t.due_on ?? (t.created_at ? t.created_at.slice(0, 10) : null),
            status: t.completed ? 'completed' : 'pitched',
            invoice_number: fin.invoice,
            income_task_gid: t.gid,
            notes: t.name,
          };
          if (dealId) {
            await supabase.from('deals').update(payload).eq('id', dealId);
          } else {
            dealId =
              (await supabase.from('deals').insert(payload).select('id').single()).data?.id ?? null;
            if (dealId) dealTotal += 1;
          }
          if (!dealId) continue;

          await supabase.from('deal_financials').upsert(
            {
              deal_id: dealId,
              gross: fin.gross,
              influencer: fin.influencer,
              manager: fin.manager,
              taxes: fin.taxes,
              net: fin.net,
              contact_email: fin.email,
            },
            { onConflict: 'deal_id' },
          );
          if (fin.gross != null) {
            await supabase
              .from('deal_budgets')
              .upsert({ deal_id: dealId, budget: fin.gross }, { onConflict: 'deal_id' });
          }
        }
      }
    }

    revalidatePath('/crm/tasks');
    revalidatePath('/crm/leads');
    revalidatePath('/crm/deals');
    revalidatePath('/crm/companies');
    return { ok: true, projects: projects.length, tasks: taskTotal, deals: dealTotal, leads: leadTotal };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Asana sync failed.' };
  }
}

function taskRow(t: AsanaTask, projectGid: string) {
  return {
    gid: t.gid,
    project_gid: projectGid,
    name: t.name,
    notes: t.notes ?? null,
    completed: t.completed ?? false,
    assignee_gid: t.assignee?.gid ?? null,
    assignee_name: t.assignee?.name ?? null,
    due_on: t.due_on ?? null,
    permalink_url: t.permalink_url ?? null,
    created_at: t.created_at ?? null,
    modified_at: t.modified_at ?? null,
    synced_at: new Date().toISOString(),
  };
}

// Which project feeds CRM leads: an explicit gid via env, else name heuristic.
function isLeadsProject(gid: string, name: string): boolean {
  if (process.env.ASANA_LEADS_PROJECT_GID) return gid === process.env.ASANA_LEADS_PROJECT_GID;
  return /pitch engine|warm lead/i.test(name);
}

// Pull the contact email from a task's notes — prefers the "EMAIL:" line, falls
// back to the first email anywhere in the notes. Returns null when none.
function parseEmail(notes?: string | null): string | null {
  if (!notes) return null;
  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const labelled = notes.match(/EMAIL:\s*([^\n]+)/i);
  const source = labelled ? labelled[1] : notes;
  const match = source.match(emailRe);
  return match ? match[0] : null;
}

// Derive a clean brand name from a per-creator task title: drop a leading
// "Gifting-", truncate at the first " - "/" x " separator, and strip trailing
// parentheticals and campaign words. Mirrors the seed SQL so both agree.
function cleanBrand(name: string): string {
  let n = name.trim();
  n = n.replace(/^gifting[ -]+/i, '');
  n = n.replace(/\s*[-–—]\s+.*$/, '');
  n = n.replace(/\s+[x×]\s+.*$/i, '');
  n = n.replace(/\s*\(.*\)\s*$/, '');
  n = n.replace(/\s+(campaign|partnership|launch|final|seasonal|platform)\s*$/i, '');
  n = n.trim();
  return n || name.trim();
}

// Talent id for an "<Name>'s Income Tracker" project (by talent name), else null.
function incomeTrackerTalentId(
  projectName: string,
  talentByName: Map<string, string>,
): string | null {
  if (!/income tracker/i.test(projectName)) return null;
  const name = projectName.replace(/[’'`]?s?\s+income tracker.*$/i, '').trim();
  return talentByName.get(name.toLowerCase()) ?? null;
}

// A dollar figure after "LABEL:" / "LABEL=" (handles "$", commas, "Rate=", and
// the "Manager (20%):" variant). Returns null for "—"/blank. First match wins.
function parseMoney(notes: string, label: string): number | null {
  const m = notes.match(
    new RegExp(`${label}(?:\\s*\\([^)]*\\))?\\s*[:=]\\s*\\$?\\s*([0-9][0-9,.]*)`, 'i'),
  );
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

function parseFinancials(notes?: string | null) {
  const n = notes ?? '';
  const invoice = n.match(/Invoice\s*(?:Number|#)?\s*:\s*([0-9]+)/i);
  const emailLine = n.match(/Contact Email:\s*([^\n]+)/i);
  const email = emailLine?.[1].match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  return {
    gross: parseMoney(n, 'Gross') ?? parseMoney(n, 'Rate'),
    influencer: parseMoney(n, 'Influencer'),
    manager: parseMoney(n, 'Manager'),
    taxes: parseMoney(n, 'Taxes'),
    net: parseMoney(n, 'Net'),
    invoice: invoice ? invoice[1] : null,
    email,
  };
}

// Value after a "LABEL:" line in the pitch notes (OWNER / HISTORY / FIT / …).
function field(notes: string, label: string): string | null {
  const m = notes.match(new RegExp(`${label}:\\s*([^\\n]*)`, 'i'));
  return m && m[1].trim() ? m[1].trim() : null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Best-effort date from the varied pitch-note formats: M/D/YYYY, M/D/YY, M/YYYY,
// "Month YYYY", or "now" (→ today). Returns null for "ongoing"/unparseable.
function parseDateFromText(text: string | null, now: Date): string | null {
  if (!text) return null;
  const t = text.trim();
  if (/^now\b/i.test(t)) return ymd(now);
  const md = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (md) {
    const year = md[3].length === 2 ? 2000 + Number(md[3]) : Number(md[3]);
    return ymd(new Date(year, Number(md[1]) - 1, Number(md[2])));
  }
  const my = t.match(/\b(\d{1,2})\/(\d{4})\b/);
  if (my) return ymd(new Date(Number(my[2]), Number(my[1]) - 1, 1));
  const mn = t.match(/\b([A-Za-z]{3,9})\.?\s+(\d{4})\b/);
  if (mn) {
    const m = MONTHS[mn[1].slice(0, 3).toLowerCase()];
    if (m !== undefined) return ymd(new Date(Number(mn[2]), m, 1));
  }
  return null;
}
