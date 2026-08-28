import { LinkIcon } from './icons'

/** Inline "why did it say that" chip — the explainability pillar made
 * tangible. Clicking swaps the open context drawer to the cited source. */
export function CitationChip({
  label,
  onOpen,
}: {
  label: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-hairline bg-canvas px-2 py-0.5 align-middle text-[11px] font-medium text-muted transition-colors hover:border-pulse/40 hover:text-pulse"
    >
      <LinkIcon className="h-3 w-3" />
      {label}
    </button>
  )
}
