import { saveTalentAccount, deleteTalentAccount, syncTalentAccount } from '@/lib/crm/actions';
import type { TalentAccount } from '@/lib/crm/data';
import { PLATFORMS, platformIcon, platformLabel, isSyncable } from '@/lib/platforms';

const iconFor = platformIcon;
const labelFor = platformLabel;

const fieldCls =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink';

function AccountForm({
  talentId,
  account,
}: {
  talentId: string;
  account?: TalentAccount;
}) {
  const isNew = !account;
  return (
    <form
      action={saveTalentAccount}
      className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-white p-4 sm:grid-cols-[auto_1fr_1fr_1fr_auto] sm:items-end"
    >
      {account && <input type="hidden" name="id" value={account.id} />}
      <input type="hidden" name="talent_id" value={talentId} />

      <label className="text-xs text-stone">
        Platform
        <select name="platform" defaultValue={account?.platform ?? 'instagram'} className={`${fieldCls} mt-1`}>
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.icon} {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-stone">
        Handle
        <input name="handle" defaultValue={account?.handle ?? ''} placeholder="@you" className={`${fieldCls} mt-1`} />
      </label>

      <label className="text-xs text-stone">
        Link
        <input name="url" defaultValue={account?.url ?? ''} placeholder="https://…" className={`${fieldCls} mt-1`} />
      </label>

      <label className="text-xs text-stone">
        Followers
        <input
          name="followers"
          defaultValue={account?.followers ?? ''}
          placeholder="12000"
          inputMode="numeric"
          className={`${fieldCls} mt-1`}
        />
      </label>

      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <button className="flex-1 rounded-full bg-ink px-4 py-2 text-sm text-ivory transition-colors hover:bg-tulip">
          {isNew ? 'Add' : 'Save'}
        </button>
      </div>
    </form>
  );
}

export function AccountsManager({
  talentId,
  accounts,
}: {
  talentId: string;
  accounts: TalentAccount[];
}) {
  return (
    <div className="space-y-3">
      {accounts.map((a) => (
        <div key={a.id} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <span aria-hidden>{iconFor(a.platform)}</span>
              {labelFor(a.platform)}
              {a.handle && <span className="text-stone">· {a.handle}</span>}
              {a.verified && (
                <span className="rounded-full bg-[#5B8C5A]/10 px-2 py-0.5 text-[0.65rem] font-medium text-[#5B8C5A]">
                  ✓ Verified
                </span>
              )}
            </span>
            <div className="flex items-center gap-3">
              {a.platform === 'youtube' && (
                <a
                  href={`/api/youtube/connect?account=${a.id}`}
                  className="text-xs text-tulip underline-offset-2 hover:underline"
                >
                  {a.yt_channel_id ? 'Reconnect YouTube' : 'Connect YouTube'}
                </a>
              )}
              {isSyncable(a.platform) && (
                <form action={syncTalentAccount}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-xs text-tulip underline-offset-2 hover:underline">
                    Sync
                  </button>
                </form>
              )}
              <form action={deleteTalentAccount}>
                <input type="hidden" name="id" value={a.id} />
                <button className="text-xs text-stone underline-offset-2 hover:text-tulip hover:underline">
                  Remove
                </button>
              </form>
            </div>
          </div>
          <AccountForm talentId={talentId} account={a} />
        </div>
      ))}

      <div className="pt-2">
        <p className="mb-2 px-1 text-sm font-medium text-ink">Add an account</p>
        <AccountForm talentId={talentId} />
      </div>
    </div>
  );
}
