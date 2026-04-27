/**
 * Inline SVG icon library — v1.8 Glass Design System (#76).
 * All icons use stroke="currentColor", strokeWidth="1.6", strokeLinecap="round".
 * Size defaults to 16×16 (w-4 h-4).
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function base(children: React.ReactNode, props: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function Edit(p: IconProps): React.JSX.Element {
  return base(
    <>
      <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5Z" />
    </>,
    p
  )
}

export function Trash(p: IconProps): React.JSX.Element {
  return base(
    <>
      <path d="M3 4.5h10M6 4.5V3h4v1.5M5 7l.5 5.5h5L11 7" />
    </>,
    p
  )
}

export function Archive(p: IconProps): React.JSX.Element {
  return base(
    <>
      <rect x="2" y="3" width="12" height="3" rx="1" />
      <path d="M3.5 6v6a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V6M6.5 9h3" />
    </>,
    p
  )
}

export function Unarchive(p: IconProps): React.JSX.Element {
  return base(
    <>
      <rect x="2" y="3" width="12" height="3" rx="1" />
      <path d="M3.5 6v6a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V6M8 9V12M6.5 10.5 8 9l1.5 1.5" />
    </>,
    p
  )
}

export function Plus(p: IconProps): React.JSX.Element {
  return base(
    <>
      <path d="M8 3v10M3 8h10" />
    </>,
    p
  )
}

export function X(p: IconProps): React.JSX.Element {
  return base(
    <>
      <path d="M4 4l8 8M12 4l-8 8" />
    </>,
    p
  )
}

export function ChevronLeft(p: IconProps): React.JSX.Element {
  return base(
    <>
      <path d="M10 3L5 8l5 5" />
    </>,
    p
  )
}

export function ChevronRight(p: IconProps): React.JSX.Element {
  return base(
    <>
      <path d="M6 3l5 5-5 5" />
    </>,
    p
  )
}

export function ChevronDown(p: IconProps): React.JSX.Element {
  return base(
    <>
      <path d="M3 6l5 5 5-5" />
    </>,
    p
  )
}

export function Play(p: IconProps): React.JSX.Element {
  return base(
    <>
      <path d="M5 3l9 5-9 5V3Z" />
    </>,
    p
  )
}

export function Stop(p: IconProps): React.JSX.Element {
  return base(
    <>
      <rect x="4" y="4" width="8" height="8" rx="1" />
    </>,
    p
  )
}

export function Clock(p: IconProps): React.JSX.Element {
  return base(
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5l2.5 1.5" />
    </>,
    p
  )
}

export function Check(p: IconProps): React.JSX.Element {
  return base(
    <>
      <path d="M3 8.5l3.5 3.5 6.5-7" />
    </>,
    p
  )
}

export function Dot(p: IconProps): React.JSX.Element {
  return base(
    <>
      <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />
    </>,
    p
  )
}
