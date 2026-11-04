/** Two linked rings: the mark for Chain Lab. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#ffd23f" />
      <g fill="none" stroke="#1b1d22" strokeWidth="2.6" strokeLinecap="round">
        <rect x="6" y="11" width="12" height="10" rx="5" />
        <rect x="14" y="11" width="12" height="10" rx="5" />
      </g>
    </svg>
  );
}
