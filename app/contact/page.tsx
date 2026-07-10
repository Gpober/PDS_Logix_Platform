import type { Metadata } from 'next';
import { ImageSlot } from '@/components/ImageSlot';
import { getSiteImageUrl } from '@/lib/queries';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Get in touch with Tulips Talent — for brand collaborations, representation, or press. We’d love to hear from you.',
};

export const revalidate = 60;

export default async function ContactPage() {
  const contactUrl = await getSiteImageUrl('contact');
  return (
    <section className="container-x py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Get in Touch</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] sm:text-6xl">
          Contact Us
        </h1>
        <p className="mx-auto mt-5 max-w-md text-stone">
          Whether you&apos;re a brand looking to collaborate, a creator hoping to be represented,
          or simply want to say hello — we&apos;d love to hear from you.
        </p>
      </div>

      <div className="mt-14 grid items-start gap-10 lg:grid-cols-[1.05fr_1fr]">
        <ImageSlot
          label="Editorial lifestyle image — warm, on-brand"
          ratio="aspect-[4/5]"
          rounded="rounded-3xl"
          className="hidden lg:block"
          src={contactUrl}
          alt="Tulips Talent"
          sizes="(max-width: 1024px) 100vw, 600px"
          quality={90}
        />
        <div className="rounded-3xl border border-line bg-white/40 p-6 sm:p-8">
          <ContactForm />
          <div className="mt-8 border-t border-line pt-6 text-sm text-stone">
            <p>Prefer email?</p>
            <a href="mailto:collab@tulipstalent.co" className="link-underline text-ink">
              collab@tulipstalent.co
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
