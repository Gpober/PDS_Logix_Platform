// Nudges a creator to reconnect a social account before its token lapses (which
// would silently stop auto-publishing). Renders nothing unless expiry is near or
// passed. Defaults to Instagram; pass label/href/emoji for other networks.
export function IgReconnectBanner({
  days,
  label = 'Instagram',
  href = '/api/instagram/connect',
  emoji = '📸',
}: {
  days: number | null;
  label?: string;
  href?: string;
  emoji?: string;
}) {
  if (days === null || days > 7) return null;

  const expired = days < 0;
  return (
    <div
      className={
        'mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm ' +
        (expired
          ? 'border border-red-200 bg-red-50 text-red-700'
          : 'border border-tulip/40 bg-blush/60 text-tulip-dark')
      }
    >
      <span>
        {expired
          ? `Your ${label} connection has expired — scheduled posts won’t publish until you reconnect.`
          : `Your ${label} connection expires in ${days} day${days === 1 ? '' : 's'}. Reconnect to keep auto-publishing.`}
      </span>
      <a
        href={href}
        className="shrink-0 rounded-full bg-ink px-3 py-1 text-xs font-medium text-ivory hover:bg-tulip"
      >
        {emoji} Reconnect {label}
      </a>
    </div>
  );
}
