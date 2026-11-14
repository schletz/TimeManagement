/** Error box with optional retry. Renders nothing without a message. */
export function ErrorBox({ message, onRetry }: { message: string | null | undefined; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="error-box" role="alert">
      <span>{message}</span>
      {onRetry && <button type="button" className="btn btn-small" onClick={onRetry}>Erneut versuchen</button>}
    </div>
  );
}
