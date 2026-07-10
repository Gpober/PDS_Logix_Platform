import type { Metadata } from 'next';
import { getPublicBrands } from '@/lib/queries';
import { BrandWall } from '@/components/BrandWall';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Brands we work with',
  description: 'The brands that partner with Tulips Talent creators.',
};

export default async function BrandsPage() {
  const brands = await getPublicBrands();

  return (
    <section className="container-x pt-16">
      <div className="text-center">
        <p className="eyebrow">Partnerships</p>
        <h1 className="mt-3 font-display text-4xl sm:text-6xl">Brands we work with</h1>
        <p className="mx-auto mt-4 max-w-xl text-stone">
          From challenger beauty to global fashion houses — the brands that trust our roster
          to tell their story.
        </p>
      </div>

      <div className="mt-12">
        <BrandWall brands={brands} />
      </div>
    </section>
  );
}
