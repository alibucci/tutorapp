import { gameStyle } from "@/lib/gameStyles";

/**
 * Small pieces every screen shares. Server-safe: no hooks, no state.
 */

const TILE_COLOURS = [
  { bg: "#e8eefb", fg: "#2f4fa8" },
  { bg: "#fbede8", fg: "#a23e1c" },
  { bg: "#edf5e4", fg: "#3b5323" },
  { bg: "#f3eafb", fg: "#6b3fa0" },
  { bg: "#e6f3f6", fg: "#1d6676" },
  { bg: "#fdf1e3", fg: "#9a4a06" },
];

/** Same name, same colour, on every screen and every visit. */
function tileFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLOURS[hash % TILE_COLOURS.length];
}

export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const { bg, fg } = tileFor(name);
  return (
    <span
      aria-hidden
      className={`avatar avatar-${size}`}
      style={{ background: bg, color: fg }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function StyleTag({ id }: { id?: string }) {
  if (!id) return <span className="tag tag-quiet">No game style</span>;
  const style = gameStyle(id);
  if (style.skin) return <span className={`tag tag-${style.skin}`}>{style.name}</span>;
  // Any other theme: a chip in its own accent, with a swatch of its ground.
  return (
    <span
      className="tag"
      style={{
        background: `color-mix(in oklab, ${style.palette.accent} 18%, white)`,
        color: style.palette.ink,
      }}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-sm"
        style={{ background: style.palette.ground, border: `2px solid ${style.palette.accent}` }}
      />
      {style.name}
    </span>
  );
}

// Icons: stroke SVGs that take the text colour.

function Svg({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const ChevronRight = () => (
  <Svg size={18}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);
export const ChevronLeft = () => (
  <Svg size={22}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);
export const ImageIcon = ({ size }: { size?: number }) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m21 16-5-5-8 9" />
  </Svg>
);
export const ChatIcon = () => (
  <Svg>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
);
export const MicIcon = () => (
  <Svg>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
  </Svg>
);
export const CopyIcon = () => (
  <Svg size={18}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);
export const PlusIcon = () => (
  <Svg size={24}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const BookIcon = () => (
  <Svg>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
  </Svg>
);
