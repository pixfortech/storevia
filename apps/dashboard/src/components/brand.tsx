export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-semibold tracking-tight text-ink ${className ?? ""}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6">
        <rect width="24" height="24" rx="7" className="fill-brand-600" />
        <path
          d="M7 15.5c1.2 1.1 2.8 1.7 4.6 1.7 2.3 0 3.9-1.1 3.9-2.8 0-1.6-1.2-2.3-3.6-2.8-2.1-.4-2.9-.8-2.9-1.6 0-.8.8-1.3 2-1.3 1.3 0 2.4.5 3.2 1.2"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span>Storevia</span>
    </span>
  );
}
