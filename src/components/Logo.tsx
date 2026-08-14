export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="BLE3D">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" opacity=".24" />
          <path d="M20 6v28l8-7-8-7 8-7-8-7Zm0 14-8-7m8 7-8 7" />
          <circle cx="20" cy="20" r="2.5" />
        </svg>
      </span>
      {!compact && (
        <span>
          <strong>BLE3D</strong>
          <small>PROXIMITY MAPPER</small>
        </span>
      )}
    </div>
  );
}
