import Link from 'next/link';
import Image from 'next/image';
import type { PublicTalent } from '@/lib/types';
import { formatCount, totalReach } from '@/lib/format';

export function TalentCard({ talent }: { talent: PublicTalent }) {
  const reach = totalReach(talent.audience_stats);
  const href = talent.slug ? `/talent/${talent.slug}` : '#';

  return (
    <Link href={href} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-blush">
        {talent.headshot_url ? (
          <Image
            src={talent.headshot_url}
            alt={talent.name}
            fill
            sizes="(max-width: 768px) 50vw, 320px"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-display text-5xl text-tulip/40">
            {talent.name.charAt(0)}
          </div>
        )}
        {talent.category && (
          <span className="absolute left-3 top-3 rounded-full bg-ivory/90 px-3 py-1 text-xs font-medium text-ink">
            {talent.category}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg leading-tight">{talent.name}</h3>
        {reach > 0 && (
          <span className="shrink-0 text-sm text-stone">{formatCount(reach)} reach</span>
        )}
      </div>
      {talent.handle && <p className="text-sm text-tulip">{talent.handle}</p>}
    </Link>
  );
}
