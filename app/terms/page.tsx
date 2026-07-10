import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'Terms and conditions for using the Tulips Talent website.',
};

export default function TermsPage() {
  return (
    <section className="container-x py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">Legal</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] sm:text-6xl">
          Terms &amp; Conditions
        </h1>
        <div className="mt-8 space-y-6 text-stone">
          <p>
            Welcome to Tulips Talent. By accessing and using this website, you agree to the
            following terms. Please read them carefully.
          </p>
          <div>
            <h2 className="font-display text-2xl text-ink">Use of this site</h2>
            <p className="mt-2">
              The content on this site — including copy, imagery, and talent profiles — is provided
              for informational purposes and remains the property of Tulips Talent and its
              represented creators. You may not reproduce or redistribute it without permission.
            </p>
          </div>
          <div>
            <h2 className="font-display text-2xl text-ink">Enquiries &amp; submissions</h2>
            <p className="mt-2">
              Information you submit through our contact and representation forms is used solely to
              respond to your enquiry and to consider potential collaborations. We do not sell your
              information to third parties.
            </p>
          </div>
          <div>
            <h2 className="font-display text-2xl text-ink">Contact</h2>
            <p className="mt-2">
              Questions about these terms? Email us at{' '}
              <a href="mailto:collab@tulipstalent.co" className="link-underline text-ink">
                collab@tulipstalent.co
              </a>
              .
            </p>
          </div>
          <p className="pt-4 text-sm">© 2026 Tulips Talent. All rights reserved.</p>
        </div>
      </div>
    </section>
  );
}
