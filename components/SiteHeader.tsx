import Link from 'next/link';
import { PdsMark } from './PdsMark';

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-white/80 backdrop-blur">
      <div className="container-x flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-semibold">
          <PdsMark className="h-6 w-6 text-pds" />
          PDS Logix
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/#services" className="text-stone hover:text-ink">
            Services
          </Link>
          <Link href="/contact" className="text-stone hover:text-ink">
            Request a quote
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-ink px-4 py-2 text-white transition-colors hover:bg-steel"
          >
            Team sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
