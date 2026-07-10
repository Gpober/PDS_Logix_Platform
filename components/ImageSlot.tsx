import Image from 'next/image';

/**
 * A sage-green image placeholder marking where Jessica drops a final image.
 * Renders the real image once `src` is provided (so slots become photos with
 * no layout change). `ratio` is any Tailwind aspect utility, e.g. "aspect-[3/4]".
 */
export function ImageSlot({
  label,
  ratio = 'aspect-[4/3]',
  src,
  alt,
  className = '',
  priority,
  rounded = 'rounded-2xl',
  sizes,
  quality,
  imgClassName = '',
}: {
  label: string;
  ratio?: string;
  src?: string | null;
  alt?: string;
  className?: string;
  priority?: boolean;
  rounded?: string;
  sizes?: string;
  quality?: number;
  imgClassName?: string;
}) {
  return (
    <div className={`relative overflow-hidden ${rounded} ${ratio} ${className}`}>
      {src ? (
        <Image
          src={src}
          alt={alt ?? label}
          fill
          priority={priority}
          sizes={sizes ?? '(max-width: 768px) 100vw, 400px'}
          quality={quality ?? 82}
          className={`object-cover ${imgClassName}`}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-dashed border-sage/60 bg-sage-soft/60 p-4 text-center">
          <span className="font-display text-2xl text-sage">▢</span>
          <span className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-sage">
            Image
          </span>
          <span className="max-w-[85%] text-xs leading-snug text-sage/80">{label}</span>
        </div>
      )}
    </div>
  );
}
