import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="container-x flex flex-col items-center justify-between gap-3 py-8 text-sm text-stone sm:flex-row">
        <p>© {new Date().getFullYear()} PDS Logix. Vehicle condition reports, detailing & biohazard.</p>
        <div className="flex gap-6">
          <Link href="/contact" className="hover:text-ink">
            Request a quote
          </Link>
          <Link href="/login" className="hover:text-ink">
            Team sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
