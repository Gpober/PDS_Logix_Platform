// The official Tulips Talent logomark. Rendered as a CSS mask over the brand PNG
// so it still inherits `currentColor` — every existing usage keeps its colour
// intent (text-tulip in the headers, text-ivory on the dark footer) while showing
// the real logo. The favicon/apple icon come from app/icon.png + app/apple-icon.png.
const MASK = 'url(/tulips-logomark.png)';

export function TulipMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current ${className ?? ''}`}
      style={{
        WebkitMaskImage: MASK,
        maskImage: MASK,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}
