export default function AmadeusLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect x="2" y="14" width="3" height="8" rx="1.5" fill="hsl(271, 91%, 65%)" />
      <rect x="7" y="10" width="3" height="12" rx="1.5" fill="hsl(271, 91%, 65%)" />
      <rect x="12" y="6" width="3" height="16" rx="1.5" fill="hsl(271, 91%, 65%)" />
      <rect x="17" y="9" width="3" height="13" rx="1.5" fill="hsl(271, 91%, 65%)" />
      <rect x="22" y="12" width="3" height="10" rx="1.5" fill="hsl(271, 91%, 65%)" />
    </svg>
  );
}
