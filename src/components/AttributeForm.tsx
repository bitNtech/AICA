import { useState } from 'react'
import type { AttributeField } from '../types'
import { Toggle } from './Toggle'

const TYPE_OPTIONS = ['Text', 'Phone', 'Email', 'ID', 'DateRange', 'Boolean', 'Enum']

/** Add or edit a single captured-on-every-call attribute. Same shape for
 * both: creating starts from a blank/suggested draft, editing starts from
 * the existing row. */
export function AttributeForm({
  initial,
  onSave,
}: {
  initial: AttributeField
  onSave: (field: AttributeField) => void
}) {
  const [name, setName] = useState(initial.name)
  const [type, setType] = useState(initial.type)
  const [validation, setValidation] = useState(initial.validation)
  const [required, setRequired] = useState(initial.required)
  const [capturedAt, setCapturedAt] = useState(initial.capturedAt)
  const [mapsTo, setMapsTo] = useState(initial.mapsTo)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="attr-name">
          Attribute name
        </label>
        <input
          id="attr-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. insurance_provider"
          className="input mt-1.5 w-full font-mono"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="attr-type">
            Type
          </label>
          <select
            id="attr-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1.5 w-full rounded-full border border-hairline bg-surface px-4 py-1.5 text-sm text-body transition-colors focus:border-pulse/50 focus:outline-none"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="attr-captured">
            Captured at
          </label>
          <input
            id="attr-captured"
            value={capturedAt}
            onChange={(e) => setCapturedAt(e.target.value)}
            placeholder="e.g. Detect intent"
            className="input mt-1.5 w-full"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="attr-validation">
          Live validation rule
        </label>
        <input
          id="attr-validation"
          value={validation}
          onChange={(e) => setValidation(e.target.value)}
          placeholder="e.g. E.164 + spell-back confirm"
          className="input mt-1.5 w-full"
        />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="attr-maps-to">
          Maps to (CRM field)
        </label>
        <input
          id="attr-maps-to"
          value={mapsTo}
          onChange={(e) => setMapsTo(e.target.value)}
          placeholder="e.g. Contact.Phone"
          className="input mt-1.5 w-full font-mono"
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-hairline bg-canvas px-4 py-3">
        <span className="text-sm text-body">Required on every call</span>
        <Toggle checked={required} onChange={setRequired} label="Required" />
      </div>

      <button
        type="button"
        disabled={!name.trim()}
        onClick={() =>
          onSave({
            name: name.trim(),
            type,
            validation: validation.trim() || 'Not yet configured',
            required,
            capturedAt: capturedAt.trim() || 'Automatic',
            mapsTo: mapsTo.trim() || '—',
          })
        }
        className="btn-primary self-start"
      >
        Save attribute
      </button>
    </div>
  )
}
