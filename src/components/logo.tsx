export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="20" cy="16" r="8" className="fill-blue" />
      <path
        d="M6 46c1.2-11 8-16 15.5-16 3.2 0 5.8 1 8.2 3.2-4.2 1.6-7.2 5.4-8.2 10.2L6 46Z"
        className="fill-blue"
      />
      <circle cx="46" cy="15" r="8" className="fill-green" />
      <path
        d="M34 48c1.6-10 8.4-16 16.5-16 5.4 0 10 2.6 12.5 7.2-6.6 1.2-12.2 4.6-16.2 9.6L34 48Z"
        className="fill-green"
      />
      <path d="M40 8.5v6M48.5 11.2l-3.2 4.2M31.5 11.2l3.2 4.2" className="stroke-green" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M16 30.5h22.5a11 11 0 0 1 11 11v.5a11 11 0 0 1-11 11H27l-8 6.2V52a11 11 0 0 1-8.2-4.2A11 11 0 0 1 16 30.5Z"
        className="fill-green"
      />
      <circle cx="27" cy="42" r="2.1" className="fill-on-green" />
      <circle cx="34" cy="42" r="2.1" className="fill-on-green" />
      <circle cx="41" cy="42" r="2.1" className="fill-on-green" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      <span className="text-blue">TELI</span>
      <span className="text-green">TALL</span>
    </span>
  );
}
