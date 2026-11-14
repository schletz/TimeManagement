import { useEffect } from 'react';
import { setLastProjectId, useProjects } from '../hooks/useProjects';

/**
 * Project selection for the entry forms. Shows active projects (the chef also sees closed ones).
 * The choice is remembered as "last project".
 */
export function ProjectSelect({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const { data: projects, error } = useProjects();
  // The backend already filters: employees get active projects only, the chef gets all.
  const list = projects ?? [];

  // Clear a remembered project that no longer exists.
  useEffect(() => {
    if (projects && value && !projects.some((p) => p.id === value)) onChange('');
  }, [projects, value, onChange]);

  return (
    <label className="field">
      <span>Projekt</span>
      <select
        value={value}
        disabled={disabled}
        required
        onChange={(e) => {
          setLastProjectId(e.target.value);
          onChange(e.target.value);
        }}
      >
        <option value="">{projects ? '– Projekt wählen –' : error ? 'Projekte nicht geladen' : 'Lädt …'}</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.status === 'closed' ? ' (abgeschlossen)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
