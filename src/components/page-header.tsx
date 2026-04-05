import Link from 'next/link';

export function PageHeader({
  backHref,
  backLabel,
  title,
  description,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <Link href={backHref} className="text-sm text-slate-600 underline">
        {backLabel}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h1>
      {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      {children}
    </div>
  );
}
