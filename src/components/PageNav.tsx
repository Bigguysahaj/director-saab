import Link from "next/link";

const LINK =
  "rounded-full border border-border bg-bg-panel px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg";
const CURRENT = "rounded-full border border-accent bg-accent-soft px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-accent";

const STEPS = [
  { href: "/audition", label: "Audition" },
  { href: "/stage", label: "Stage" },
  { href: "/screen-test", label: "Screen Test" },
];

/** Sticky top bar for the pre-production pages, in workflow order. */
export function PageNav({ current }: { current: string }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg/90 px-6 py-4 backdrop-blur">
      <Link href="/" className={LINK}>
        ← Director
      </Link>
      <nav className="flex flex-wrap gap-2">
        {STEPS.map((step) =>
          step.href === current ? (
            <span key={step.href} aria-current="page" className={CURRENT}>
              {step.label}
            </span>
          ) : (
            <Link key={step.href} href={step.href} className={LINK}>
              {step.label}
            </Link>
          )
        )}
      </nav>
    </div>
  );
}
