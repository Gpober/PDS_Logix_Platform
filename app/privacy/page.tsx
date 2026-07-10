import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Tulips Talent collects, uses, and protects your information.',
};

export default function PrivacyPage() {
  return (
    <section className="container-x py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <p className="eyebrow">Legal</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] sm:text-6xl">Privacy Policy</h1>
        <p className="mt-4 text-sm text-stone">Last updated: July 2026</p>

        <div className="mt-8 space-y-8 text-stone">
          <p>
            Tulips Talent (“we,” “us”) operates the website at tulipstalent.co and a creator portal
            for the talent we represent. This policy explains what information we collect, how we use
            it, and the choices you have.
          </p>

          <div>
            <h2 className="font-display text-2xl text-ink">Information we collect</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong>Enquiries.</strong> When you submit our contact or representation form, we
                collect the name, email, phone, and message you provide.
              </li>
              <li>
                <strong>Creator profiles.</strong> For talent we represent, we store profile details
                (name, bio, photos, category, self-reported audience figures, and social links) to
                display on the site and manage in our CRM.
              </li>
              <li>
                <strong>Connected social accounts.</strong> If a creator chooses to connect a social
                account (e.g. YouTube or Instagram) through the portal, we receive an access token
                and limited account data to provide the features below.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-2xl text-ink">How we use connected accounts</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong>YouTube.</strong> With read-only permission, we retrieve a creator’s public
                channel information and subscriber count to display verified statistics on their
                portal and media kit. We do not modify, upload, or delete any YouTube content.
                Our use of YouTube data is also governed by the{' '}
                <a
                  href="https://www.google.com/policies/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline text-ink"
                >
                  Google Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong>Instagram.</strong> With a creator’s authorization, we publish photo and
                video posts they create in the portal to their own Instagram professional account.
                We act only at the creator’s direction and never post without their action.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-2xl text-ink">How we use your information</h2>
            <p className="mt-2">
              We use the information above to respond to enquiries, represent and promote our
              creators, provide the portal’s features, and communicate with you. We do not sell your
              personal information.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl text-ink">Service providers</h2>
            <p className="mt-2">
              We rely on trusted providers to run the service, including Supabase (database and
              storage), Vercel (hosting), and Google Workspace (email). Connected-account data is
              processed via Google (YouTube) and Meta (Instagram) APIs. These providers process data
              only to provide their services to us.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl text-ink">Data retention &amp; your choices</h2>
            <p className="mt-2">
              We keep information for as long as needed to provide the service. A creator can
              disconnect a social account at any time from the portal, which revokes our access
              token. To request access to, correction of, or deletion of your information, email us
              at the address below.
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl text-ink">Contact</h2>
            <p className="mt-2">
              Questions or requests about this policy? Email{' '}
              <a href="mailto:collab@tulipstalent.co" className="link-underline text-ink">
                collab@tulipstalent.co
              </a>
              .
            </p>
          </div>

          <p className="pt-2 text-sm">© 2026 Tulips Talent. All rights reserved.</p>
        </div>
      </div>
    </section>
  );
}
