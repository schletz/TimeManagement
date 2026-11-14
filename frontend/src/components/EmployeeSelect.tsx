import { useMe } from '../auth/AuthContext';

/** Employee selection for the chef (records for other employees). Renders nothing for employees. */
export function EmployeeSelect({ label, value, onChange, disabled }: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const me = useMe();
  if (me.role !== 'chef') return null;
  const employees = (me.employees ?? []).filter((e) => e.active || e.id === value);
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} required onChange={(e) => onChange(e.target.value)}>
        <option value="">– Mitarbeiter wählen –</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
            {e.shortName ? ` (${e.shortName})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
