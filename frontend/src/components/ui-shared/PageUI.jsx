/* ---------------------------------------------------------------------------
   Small shared page furniture. Every dashboard page had grown its own slightly
   different heading (different icon size, different margin, sometimes no
   subtitle) and its own one-line "nothing here" message, which is what made the
   dashboard feel assembled rather than designed. These three are now the single
   definition.
   --------------------------------------------------------------------------- */

export function PageHeader({ icon: Icon, title, subtitle, actions, testid }) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4" data-testid={testid}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-400/20 bg-brand-500/10">
            <Icon className="h-5 w-5 text-brand-300" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-black tracking-tight text-zinc-50">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-zinc-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
          <Icon className="h-5 w-5 text-zinc-500" />
        </div>
      )}
      <div>
        <div className="text-sm font-semibold text-zinc-200">{title}</div>
        {hint && <p className="mt-1 max-w-sm text-xs text-zinc-500">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/* Loading placeholder that mirrors the shape of a list row, so content does not
   jump when the request resolves. */
export function SkeletonRows({ rows = 5, className = "" }) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-4 border-b border-white/5 p-5 last:border-b-0"
        >
          <div className="h-4 w-8 rounded bg-white/[0.07]" />
          <div className="h-11 w-11 shrink-0 rounded-full bg-white/[0.07]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-1/3 rounded bg-white/[0.07]" />
            <div className="h-3 w-1/4 rounded bg-white/[0.05]" />
          </div>
          <div className="h-4 w-16 rounded bg-white/[0.07]" />
        </div>
      ))}
    </div>
  );
}
