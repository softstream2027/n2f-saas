export default function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand${light ? " brand-light" : ""}`}>
      <svg className="brand-mark" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <rect width="28" height="28" rx="6" fill="currentColor" />
        <rect x="6" y="7" width="16" height="3" rx="1.5" fill="#fff" />
        <rect x="6" y="12.5" width="11" height="3" rx="1.5" fill="#fff" />
        <rect x="6" y="18" width="14" height="3" rx="1.5" fill="#F2C14E" />
      </svg>
      <span className="brand-name">SoftStream</span>
    </span>
  );
}
