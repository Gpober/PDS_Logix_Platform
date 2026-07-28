import Link from 'next/link';

export function CrmHeader({
  title,
  newHref,
  newLabel,
}: {
  title: string;
  newHref?: string;
  newLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-col items-center gap-3 text-center">
      <h1 className="font-display text-3xl">{title}</h1>
      {newHref && (
        <Link
          href={newHref}
          className="rounded-full bg-tulip px-4 py-2 text-sm text-ivory transition-colors hover:bg-tulip-dark"
        >
          {newLabel ?? 'New'}
        </Link>
      )}
    </div>
  );
}

export function Table({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
          {head}
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-medium">{children}</th>;
}

export function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-t border-line px-4 py-3 align-top">{children}</td>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line p-8 text-center text-stone">{children}</p>;
}

const fieldClass =
  'w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink';

export function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-stone">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? undefined}
        className={fieldClass}
      />
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-stone">{label}</span>
      <textarea name={name} rows={4} defaultValue={defaultValue ?? undefined} className={fieldClass} />
    </label>
  );
}

export function Checkbox({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        name={name}
        type="checkbox"
        value="true"
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-tulip"
      />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-stone">{hint}</span>}
      </span>
    </label>
  );
}

export function Select({
  label,
  name,
  defaultValue,
  options,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-stone">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ''} required={required} className={fieldClass}>
        <option value="">{placeholder ?? '—'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SubmitBar({ label, cancelHref }: { label: string; cancelHref: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button className="rounded-full bg-tulip px-6 py-2.5 text-sm text-ivory transition-colors hover:bg-tulip-dark">
        {label}
      </button>
      <Link href={cancelHref} className="text-sm text-stone hover:text-ink">
        Cancel
      </Link>
    </div>
  );
}
