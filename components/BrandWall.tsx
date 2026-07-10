import Image from 'next/image';
import type { PublicBrand } from '@/lib/types';

export function BrandWall({ brands }: { brands: PublicBrand[] }) {
  if (brands.length === 0) {
    return <p className="text-sm text-stone">Brand partners coming soon.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-4">
      {brands.map((brand) => (
        <div
          key={brand.id}
          className="flex h-28 items-center justify-center bg-ivory px-6 transition-colors hover:bg-blush/50"
        >
          {brand.logo_url ? (
            <Image
              src={brand.logo_url}
              alt={brand.name}
              width={120}
              height={48}
              className="max-h-12 w-auto object-contain opacity-80 transition-opacity hover:opacity-100"
            />
          ) : (
            <span className="font-display text-xl text-ink/70">{brand.name}</span>
          )}
        </div>
      ))}
    </div>
  );
}
