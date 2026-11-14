/** Loading indicator. */
export function Spinner({ label = 'Lädt …' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-dot" aria-hidden="true" />
      {label}
    </div>
  );
}
