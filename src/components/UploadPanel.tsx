import { useRef, useState } from 'react'
import { StepperStatus } from './StepperStatus'
import { PulseLine } from './PulseLine'

const STEPS = [
  { id: 'ingesting', label: 'Ingesting' },
  { id: 'parsing', label: 'Transcribing / Parsing' },
  { id: 'redacting', label: 'Redacting' },
  { id: 'indexed', label: 'Indexed' },
]

/** Drag-drop + a visible ingest pipeline — makes an otherwise invisible
 * backend process feel accountable, per the Knowledge Base spec. */
export function UploadPanel() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function startIngest(name: string) {
    setFileName(name)
    setStepIndex(0)
    STEPS.forEach((_, i) => {
      setTimeout(() => setStepIndex(i + 1), (i + 1) * 700)
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) startIngest(file.name)
  }

  if (fileName) {
    const done = stepIndex !== null && stepIndex >= STEPS.length
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-xl border border-hairline bg-canvas px-4 py-3">
          <span className="truncate text-sm font-medium text-body">{fileName}</span>
        </div>
        <StepperStatus steps={STEPS} currentIndex={stepIndex ?? 0} />
        {done ? (
          <p className="flex items-center gap-2 text-sm font-medium text-sage">
            <span className="h-1.5 w-1.5 rounded-full bg-sage" />
            Indexed and available to AICA on live calls.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <PulseLine mode="idle" height={20} className="w-24 text-pulse" aria-label="Processing" />
            <p className="text-sm text-muted">Working through the pipeline…</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors duration-150 ${
          dragOver ? 'border-pulse bg-pulse/[0.06]' : 'border-hairline bg-canvas'
        }`}
      >
        <p className="text-sm font-medium text-body">
          Drag a document here, or
        </p>
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary !px-5">
          Browse files
        </button>
        <p className="text-xs text-muted">PDF, DOCX, or plain text — up to 20MB</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) startIngest(file.name)
          }}
        />
      </div>
    </div>
  )
}
