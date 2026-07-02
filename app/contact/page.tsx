import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: 'Request a quote',
  description: 'Tell PDS Logix about your vehicle volume and locations for a quote.',
};

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="container-x max-w-2xl py-16">
          <p className="eyebrow">Get started</p>
          <h1 className="mt-3 font-display text-4xl">Request a quote</h1>
          <p className="mt-4 text-stone">
            Condition reports, detailing, or biohazard remediation — tell us what you need and
            we&apos;ll get back to you fast.
          </p>
          <div className="mt-8">
            <ContactForm />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
