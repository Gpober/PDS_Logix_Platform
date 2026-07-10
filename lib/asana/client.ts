// Server-side Asana REST client. Uses a Personal Access Token (ASANA_TOKEN,
// server-only — never NEXT_PUBLIC_). Powers the repeatable Asana → Supabase sync
// (see lib/asana/sync.ts). Only import from server components / server actions.

const ASANA_BASE = 'https://app.asana.com/api/1.0';

export function isAsanaConfigured(): boolean {
  return Boolean(process.env.ASANA_TOKEN);
}

export interface AsanaProject {
  gid: string;
  name: string;
  archived: boolean;
  team?: { gid: string } | null;
  owner?: { gid: string; name?: string } | null;
  created_at?: string | null;
}

export interface AsanaTask {
  gid: string;
  name: string;
  notes?: string | null;
  completed: boolean;
  assignee?: { gid: string; name?: string } | null;
  due_on?: string | null;
  created_at?: string | null;
  modified_at?: string | null;
  permalink_url?: string | null;
}

async function asanaGet<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const token = process.env.ASANA_TOKEN;
  if (!token) throw new Error('ASANA_TOKEN is not set');

  const results: T[] = [];
  let offset: string | undefined;

  // Asana paginates via an opaque offset token; loop until it's gone.
  do {
    const qs = new URLSearchParams({ ...params, limit: '100' });
    if (offset) qs.set('offset', offset);
    const res = await fetch(`${ASANA_BASE}${path}?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Asana ${path} failed (${res.status})`);
    }
    const json = (await res.json()) as { data: T[]; next_page?: { offset: string } | null };
    results.push(...(json.data ?? []));
    offset = json.next_page?.offset;
  } while (offset);

  return results;
}

// The user's default workspace, or ASANA_WORKSPACE if pinned. /users/me returns
// a single object (not a paginated list), so fetch it directly rather than
// through asanaGet.
export async function getWorkspaceGid(): Promise<string> {
  if (process.env.ASANA_WORKSPACE) return process.env.ASANA_WORKSPACE;
  const token = process.env.ASANA_TOKEN;
  if (!token) throw new Error('ASANA_TOKEN is not set');
  const res = await fetch(`${ASANA_BASE}/users/me?opt_fields=workspaces`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Asana /users/me failed (${res.status})`);
  const json = (await res.json()) as { data?: { workspaces?: { gid: string }[] } };
  const gid = json.data?.workspaces?.[0]?.gid;
  if (!gid) throw new Error('No Asana workspace found for this token');
  return gid;
}

export async function listProjects(workspaceGid: string): Promise<AsanaProject[]> {
  return asanaGet<AsanaProject>('/projects', {
    workspace: workspaceGid,
    archived: 'false',
    opt_fields: 'name,archived,team,owner.name,created_at',
  });
}

export async function listTasks(projectGid: string): Promise<AsanaTask[]> {
  return asanaGet<AsanaTask>('/tasks', {
    project: projectGid,
    opt_fields: 'name,notes,completed,assignee.name,due_on,created_at,modified_at,permalink_url',
  });
}
