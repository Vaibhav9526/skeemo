/**
 * Skeemo's icon set: one-weight line icons on a 24px grid, drawn for this app (no emoji anywhere in the UI).
 * Every icon inherits `currentColor` and scales with `size`.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { SchemeCategory } from '@shared/govt/schemes';

const paths: Record<string, ReactNode> = {
  office: <><path d="M4 21V6l8-3 8 3v15" /><path d="M9 21v-5h6v5" /><path d="M8 9.5h2M14 9.5h2M8 13h2M14 13h2" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  vault: <><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><circle cx="12" cy="12" r="3.4" /><path d="M12 8.6v1.2M12 14.2v1.2M8.6 12h1.2M14.2 12h1.2" /><path d="M7 20v1.5M17 20v1.5" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 15.5h6" /></>,
  folder: <><path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.2h8a1.5 1.5 0 0 1 1.5 1.5v9.3a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" /></>,
  upload: <><path d="M12 16V5M7.5 9.5L12 5l4.5 4.5" /><path d="M5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>,
  send: <><path d="M4 12l16-8-5 16-3.5-6.5z" /><path d="M11.5 13.5L20 4" /></>,
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" /></>,
  speaker: <><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  expand: <><path d="M14 4h6v6M10 20H4v-6" /><path d="M20 4l-7 7M4 20l7-7" /></>,
  map: <><path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z" /><path d="M9 4v14M15 6v14" /></>,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="8.5" /><path d="M8.2 12.3l2.8 2.8 5-5.4" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  xCircle: <><circle cx="12" cy="12" r="8.5" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.4v.1" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.4-1 .9-1 1.6M12 16.6v.1" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="15" rx="2.5" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></>,
  bell: <><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21h4" /></>,
  pin: <><path d="M12 21v-6" /><path d="M8 4h8l-1 6 3 3H6l3-3z" /></>,
  settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c3 3.2 3 13.8 0 17M12 3.5c-3 3.2-3 13.8 0 17" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-4 3.5-6 7-6s6.2 2 7 6" /></>,
  idcard: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><circle cx="9" cy="11" r="2" /><path d="M6.5 15.5c.4-1.4 1.4-2 2.5-2s2.1.6 2.5 2M14 10h4M14 13.5h4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" /><path d="M10.5 11v5.5M13.5 11v5.5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronDown: <path d="M5 9l7 7 7-7" />,
  arrowRight: <path d="M4 12h15M13 6l6 6-6 6" />,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3.5" /><circle cx="9" cy="9" r="1" /><circle cx="15" cy="15" r="1" /><circle cx="15" cy="9" r="1" /><circle cx="9" cy="15" r="1" /></>,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  scan: <><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M4 12h16" /></>,
  // scheme categories
  agriculture: <><path d="M12 21V9" /><path d="M12 12c-3.5 0-5-2-5-5 3 0 5 1.5 5 5zM12 12c3.5 0 5-2 5-5-3 0-5 1.5-5 5z" /><path d="M12 17c-3 0-4.5-1.7-4.5-4.4 2.8 0 4.5 1.5 4.5 4.4zM12 17c3 0 4.5-1.7 4.5-4.4-2.8 0-4.5 1.5-4.5 4.4z" /></>,
  health: <><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20z" /><path d="M12 10.5v4M10 12.5h4" /></>,
  housing: <><path d="M4 11.5L12 4l8 7.5" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" /></>,
  education: <><path d="M2.5 9.5L12 5l9.5 4.5L12 14z" /><path d="M6.5 11.5V16c1.5 1.5 3.4 2.2 5.5 2.2s4-.7 5.5-2.2v-4.5" /><path d="M21.5 9.5V15" /></>,
  women_child: <><circle cx="9" cy="6.5" r="2.5" /><path d="M5 20v-4.5l-1.5-3.5h11L13 15.5V20" /><circle cx="17.5" cy="12" r="1.8" /><path d="M15.5 20v-3l2-1.5 2 1.5v3" /></>,
  pension_insurance: <><path d="M12 3.5l7 2.8v5.4c0 4.4-2.8 7.6-7 8.8-4.2-1.2-7-4.4-7-8.8V6.3z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  business: <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2" /><path d="M3.5 12.5h17M11 12.5v2h2v-2" /></>,
  employment: <><path d="M14.5 6.5a3.5 3.5 0 0 0-4.7 4.4L4 16.7 7.3 20l5.8-5.8a3.5 3.5 0 0 0 4.4-4.7l-2.4 2.4-2-.5-.5-2z" /></>,
};

export type IconName = keyof typeof paths | SchemeCategory;

export function Icon({ name, size = 18, className, style, title }: { name: IconName; size?: number; className?: string; style?: CSSProperties; title?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" className={className} style={{ flexShrink: 0, ...style }}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}
    >
      {paths[name as string] ?? null}
    </svg>
  );
}

/** The chaprasi mark, as used in the title bar and splash. Same drawing as reference/skeemo-logo.svg. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" role="img" aria-label="Skeemo">
      <rect width="256" height="256" rx="56" fill="#2f5d4c" />
      <path d="M40 256c2-44 30-70 88-70s86 26 88 70z" fill="#a39246" />
      <path d="M128 186l-22 24 22 46 22-46z" fill="#8d7b3a" />
      <rect x="150" y="214" width="34" height="30" rx="3" fill="#8d7b3a" />
      <path d="M48 218c20-26 46-40 74-36l-8 22c-18 0-36 10-52 30z" fill="#c0392b" />
      <rect x="106" y="166" width="44" height="26" rx="10" fill="#b57a4d" />
      <ellipse cx="128" cy="118" rx="58" ry="62" fill="#c58a5b" />
      <path d="M68 92c0-34 26-54 60-54s60 20 60 54z" fill="#a39246" />
      <path d="M64 92h128l-6 14H70z" fill="#7d6b34" />
      <circle cx="128" cy="68" r="7" fill="#d8b23a" />
      <ellipse cx="102" cy="122" rx="8" ry="9" fill="#fff" /><circle cx="104" cy="124" r="4.5" fill="#2a1f2d" />
      <path d="M146 124q10-9 20 0" fill="none" stroke="#2a1f2d" strokeWidth="5" strokeLinecap="round" />
      <path d="M84 150c14-14 30-10 44-2 14-8 30-12 44 2-14 4-30 6-44 4-14 2-30 0-44-4z" fill="#2a1f2d" />
      <path d="M92 158c10 22 26 30 36 30s26-8 36-30c-14 6-24 8-36 8s-22-2-36-8z" fill="#fff" stroke="#2a1f2d" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}
