import { createServerSupabase } from '@/lib/supabase/server';

export interface AsanaProjectRow {
  gid: string;
  name: string;
  archived: boolean;
  owner_name: string | null;
  num_tasks: number | null;
  num_completed_tasks: number | null;
  num_incomplete_tasks: number | null;
  synced_at: string | null;
}

export interface AsanaTaskRow {
  gid: string;
  project_gid: string;
  name: string;
  completed: boolean;
  assignee_name: string | null;
  due_on: string | null;
  permalink_url: string | null;
}

export async function listAsanaProjects(): Promise<AsanaProjectRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('asana_projects')
    .select('gid, name, archived, owner_name, num_tasks, num_completed_tasks, num_incomplete_tasks, synced_at')
    .order('name');
  return (data as AsanaProjectRow[]) ?? [];
}

export async function getAsanaProject(gid: string): Promise<AsanaProjectRow | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('asana_projects')
    .select('gid, name, archived, owner_name, num_tasks, num_completed_tasks, num_incomplete_tasks, synced_at')
    .eq('gid', gid)
    .maybeSingle();
  return (data as AsanaProjectRow) ?? null;
}

export interface AsanaTaskDetail extends AsanaTaskRow {
  notes: string | null;
  created_at: string | null;
  modified_at: string | null;
  project_name: string | null;
}

export async function getAsanaTask(gid: string): Promise<AsanaTaskDetail | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('asana_tasks')
    .select(
      'gid, project_gid, name, completed, assignee_name, due_on, permalink_url, notes, created_at, modified_at, asana_projects(name)',
    )
    .eq('gid', gid)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as AsanaTaskDetail & { asana_projects: { name: string } | null };
  return { ...row, project_name: row.asana_projects?.name ?? null };
}

export async function listAsanaTasks(projectGid: string): Promise<AsanaTaskRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('asana_tasks')
    .select('gid, project_gid, name, completed, assignee_name, due_on, permalink_url')
    .eq('project_gid', projectGid)
    .order('completed')
    .order('due_on', { nullsFirst: false });
  return (data as AsanaTaskRow[]) ?? [];
}

// The CRM talent linked to an Asana project (per-creator projects), if any.
export async function talentForProject(
  projectGid: string,
): Promise<{ id: string; name: string } | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('talent')
    .select('id, name')
    .eq('asana_project_gid', projectGid)
    .maybeSingle();
  return (data as { id: string; name: string }) ?? null;
}

// Most recent sync timestamp across projects, for the "last synced" label.
export async function lastAsanaSync(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('asana_projects')
    .select('synced_at')
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { synced_at: string | null } | null)?.synced_at ?? null;
}
