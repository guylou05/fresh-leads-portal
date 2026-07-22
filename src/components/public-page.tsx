import Link from "next/link";

/** Simple centered shell used by public, unauthenticated informational pages. */
export function PublicPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-12">
      <Link
        href="/login"
        className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        <span aria-hidden="true">←</span> Back to sign in
      </Link>
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <div className="prose prose-slate mt-4 max-w-none text-sm leading-relaxed text-slate-600">
        {children}
      </div>
    </main>
  );
}
