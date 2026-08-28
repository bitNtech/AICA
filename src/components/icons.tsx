import type { ReactNode, SVGProps } from 'react'

/** A small, single-weight icon set for the nav rail and chrome — hand-drawn
 * to match the restrained brand rather than pulled from a generic library. */

type IconProps = SVGProps<SVGSVGElement>

function base(props: IconProps, children: ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const DashboardIcon = (p: IconProps) =>
  base(p, <path d="M4 13.5 10 5.5 14 11 20 4M4 19h16M9 19v-4M15 19v-6" />)

export const LiveCallsIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M5 4h3l1.5 4L7 9.5a11 11 0 0 0 7.5 7.5L16 15l4 1.5v3a1.5 1.5 0 0 1-1.6 1.5C10.6 20.4 3.6 13.4 3.5 5.6 3.5 4.7 4.2 4 5 4Z" />
    </>,
  )

export const CallLogIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>,
  )

export const KnowledgeBaseIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M5 5.2c2-.9 4.6-.9 7 .3v13c-2.4-1.2-5-1.2-7-.3Z" />
      <path d="M19 5.2c-2-.9-4.6-.9-7 .3v13c2.4-1.2 5-1.2 7-.3Z" />
    </>,
  )

export const AgentBuilderIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="6" cy="7" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <circle cx="12" cy="18" r="2.2" />
      <path d="M7.8 8.4 10.6 16M16.2 8.4 13.4 16M8.2 7h7.6" />
    </>,
  )

export const SimulationIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M9 4v5.2L5.4 17c-.7 1.4.3 3 1.9 3h9.4c1.6 0 2.6-1.6 1.9-3L15 9.2V4" />
      <path d="M8 4h8M8.5 13h7" />
    </>,
  )

export const RolloutIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M12 3c3 2.5 4.5 6 4.5 9.5S15 19 12 21c-3-2-4.5-5-4.5-8.5S9 5.5 12 3Z" />
      <circle cx="12" cy="11" r="1.8" />
      <path d="M8 18.5 5.5 21M16 18.5 18.5 21" />
    </>,
  )

export const ImprovementFeedIcon = (p: IconProps) =>
  base(p, <path d="M4 16 9 10l4 3.5L20 5M14.5 5H20v5.5" />)

export const DataReadinessIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M4.5 12a7.5 7.5 0 0 1 15 0" />
      <path d="M12 12 15.2 8" />
      <path d="M4.5 16h15" />
    </>,
  )

export const ComplianceIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M12 3.5 19 6.5v5c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9v-5Z" />
      <path d="M9.2 12 11.2 14 15 9.8" />
    </>,
  )

export const IntegrationsIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M9 3v4M15 3v4M9 17v4M15 17v4" />
      <rect x="6" y="7" width="12" height="10" rx="2" />
    </>,
  )

export const SettingsIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.6-1.4-1.5-2.6-2 .6a7.6 7.6 0 0 0-2.6-1.5l-.4-2.1H9.5l-.4 2.1a7.6 7.6 0 0 0-2.6 1.5l-2-.6-1.5 2.6 1.6 1.4a7.6 7.6 0 0 0 0 3L2.9 14.9l1.5 2.6 2-.6c.8.7 1.6 1.2 2.6 1.5l.4 2.1h4.9l.4-2.1c1-.3 1.9-.8 2.6-1.5l2 .6 1.5-2.6Z" />
    </>,
  )

export const SearchIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.5-3.5" />
    </>,
  )

export const CloseIcon = (p: IconProps) => base(p, <path d="M6 6l12 12M18 6 6 18" />)

export const ChevronRightIcon = (p: IconProps) => base(p, <path d="m9 5 7 7-7 7" />)

export const ArrowUpRightIcon = (p: IconProps) =>
  base(p, <path d="M7 17 17 7M9 7h8v8" />)

export const ArrowDownRightIcon = (p: IconProps) =>
  base(p, <path d="M7 7l10 10M17 7v10H7" />)

export const MinusIcon = (p: IconProps) => base(p, <path d="M5 12h14" />)

export const ChevronsLeftIcon = (p: IconProps) =>
  base(p, <path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />)

export const ChevronsRightIcon = (p: IconProps) =>
  base(p, <path d="m13 17 5-5-5-5M6 17l5-5-5-5" />)

export const ChevronDownIcon = (p: IconProps) => base(p, <path d="m6 9 6 6 6-6" />)

export const AlertTriangleIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M12 4 21.5 20.5h-19Z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none" />
    </>,
  )

export const AlertCircleIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5" />
      <circle cx="12" cy="15.8" r="0.9" fill="currentColor" stroke="none" />
    </>,
  )

export const CheckIcon = (p: IconProps) => base(p, <path d="m5 12.5 4.5 4.5L19 7" />)

export const LinkIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 12.6 4.9a3.2 3.2 0 0 1 4.5 4.5L15.5 11" />
      <path d="M13 17.5 11.4 19.1a3.2 3.2 0 0 1-4.5-4.5L8.5 13" />
    </>,
  )
