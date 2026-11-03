const SHELL_APPEARANCE_KEY = 'vcfo.shell.appearance';
export const SHELL_APPEARANCE_EVENT = 'vcfo-appearance';

export type SurfaceKind = 'solid' | 'gradient' | 'preset' | 'custom';
export type MotionStyle = 'none' | 'minimal' | 'smooth' | 'dynamic' | 'ambient';

export type SurfaceAppearance = {
  kind: SurfaceKind;
  solidId: string;
  gradientId: string;
  presetId: string;
  customDataUrl: string | null;
};

export type ShellAppearance = {
  hero: SurfaceAppearance;
  sidebar: SurfaceAppearance;
  motion: MotionStyle;
  reduceMotion: boolean;
};

/* The greeting card's own skin is the colour wash (R-17, `--hero-gradient`). A photo skin
   (preset or upload) lies under a light veil (`--hero-image-veil`) so the card's dark text stays
   readable. Stored preferences that still name an old solid (navy, midnight, ...) resolve to
   the wash in `parseShellAppearance`. `DashHero` writes the result into `--hero-surface-bg`,
   which `.bg-wash` reads. */
export const HERO_SOLIDS = [
  { id: 'wash', label: 'Colour wash', value: 'var(--hero-gradient)' },
] as const;

/* Two sidebar skins: navy (the default, the one weight on the screen) and white.
   Opaque token fills only: a frosted rail re-blurs the page on every hover-peek
   width frame. */
export const SIDEBAR_SOLIDS = [
  { id: 'navy', label: 'Navy', value: 'oklch(var(--side))' },
  { id: 'glass', label: 'White', value: 'oklch(var(--surface-raised))' },
] as const;

/* No gradient skins any more. Kept as an empty list so older callers and stored
   preferences keep type-checking; `parseShellAppearance` folds `gradient` into solid. */
const SURFACE_GRADIENTS: readonly { id: string; label: string; value: string }[] = [];

const LIGHT_SIDEBAR_IDS = new Set(['glass', 'white', 'mist', 'ice', 'sage']);

/* Maps the ids the old pickers wrote (midnight, ocean, mist, ...) onto the two
   that exist now. */
function normaliseSolidId(role: 'hero' | 'sidebar', id: string): string {
  if (role === 'hero') return 'wash';
  return LIGHT_SIDEBAR_IDS.has(id) ? 'glass' : 'navy';
}

export const SURFACE_PRESETS = [
  {
    id: 'linen',
    label: 'Linen',
    src: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=1400&q=70',
  },
  {
    id: 'wash',
    label: 'Wash',
    src: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1400&q=70',
  },
  {
    id: 'atlas',
    label: 'Atlas',
    src: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=70',
  },
  {
    id: 'night',
    label: 'Night',
    src: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=1400&q=70',
  },
  {
    id: 'peak',
    label: 'Peak',
    src: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1400&q=70',
  },
  {
    id: 'silk',
    label: 'Silk',
    src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1400&q=70',
  },
] as const;

export const MOTION_STYLES: { id: MotionStyle; label: string; hint: string }[] = [
  { id: 'none', label: 'None', hint: 'Static surfaces' },
  { id: 'minimal', label: 'Minimal', hint: 'Soft fades only' },
  { id: 'smooth', label: 'Smooth', hint: 'Quiet springs' },
  { id: 'dynamic', label: 'Dynamic', hint: 'Snappier motion' },
  { id: 'ambient', label: 'Ambient', hint: 'Slow atmosphere' },
];

const defaultHero: SurfaceAppearance = {
  kind: 'solid',
  solidId: 'wash',
  gradientId: '',
  presetId: 'linen',
  customDataUrl: null,
};

const defaultSidebar: SurfaceAppearance = {
  kind: 'solid',
  solidId: 'navy',
  gradientId: '',
  presetId: 'wash',
  customDataUrl: null,
};

export const DEFAULT_SHELL_APPEARANCE: ShellAppearance = {
  hero: defaultHero,
  sidebar: defaultSidebar,
  motion: 'smooth',
  reduceMotion: false,
};

function asSurface(
  raw: unknown,
  fallback: SurfaceAppearance,
  role: 'hero' | 'sidebar',
): SurfaceAppearance {
  if (!raw || typeof raw !== 'object') return fallback;
  const row = raw as Partial<SurfaceAppearance>;
  // A stored gradient preference becomes the solid skin: gradients left with the design system.
  const kind: SurfaceKind =
    row.kind === 'solid' || row.kind === 'gradient'
      ? 'solid'
      : row.kind === 'preset' || row.kind === 'custom'
        ? row.kind
        : fallback.kind;
  return {
    kind,
    solidId: normaliseSolidId(role, typeof row.solidId === 'string' ? row.solidId : fallback.solidId),
    gradientId: '',
    presetId: typeof row.presetId === 'string' ? row.presetId : fallback.presetId,
    customDataUrl: typeof row.customDataUrl === 'string' ? row.customDataUrl : fallback.customDataUrl,
  };
}

export function parseShellAppearance(raw: unknown): ShellAppearance {
  if (!raw || typeof raw !== 'object') return DEFAULT_SHELL_APPEARANCE;
  const row = raw as Partial<ShellAppearance>;
  const motion: MotionStyle = MOTION_STYLES.some((m) => m.id === row.motion)
    ? (row.motion as MotionStyle)
    : 'smooth';
  return {
    hero: asSurface(row.hero, defaultHero, 'hero'),
    sidebar: asSurface(row.sidebar, defaultSidebar, 'sidebar'),
    motion,
    reduceMotion: Boolean(row.reduceMotion),
  };
}

export function readShellAppearance(): ShellAppearance {
  if (typeof window === 'undefined') return DEFAULT_SHELL_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(SHELL_APPEARANCE_KEY);
    if (!raw) return DEFAULT_SHELL_APPEARANCE;
    return parseShellAppearance(JSON.parse(raw));
  } catch {
    return DEFAULT_SHELL_APPEARANCE;
  }
}

export function writeShellAppearance(next: ShellAppearance): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SHELL_APPEARANCE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(SHELL_APPEARANCE_EVENT));
  } catch {
    /* quota */
  }
}

export type ResolvedSurface = {
  background: string;
  overlay: string;
  ink: 'light' | 'dark';
  image: boolean;
};

function findSolid(id: string, list: readonly { id: string; value: string }[], fallback: string): string {
  return list.find((s) => s.id === id)?.value ?? fallback;
}

export function surfaceCssVars(
  resolved: ResolvedSurface,
  role: 'hero' | 'sidebar',
): Record<string, string> {
  if (role === 'hero') {
    return {
      '--hero-surface-bg': resolved.background,
      '--hero-surface-overlay': resolved.overlay,
    };
  }
  return {
    '--sidebar-surface-bg': resolved.background,
    '--sidebar-surface-overlay': resolved.overlay,
  };
}

/* A photo under the greeting card's veil: one `background` value with two layers. */
function heroImage(src: string): ResolvedSurface {
  return {
    background: `linear-gradient(var(--hero-image-veil), var(--hero-image-veil)), center / cover no-repeat url("${src}")`,
    overlay: 'transparent',
    ink: 'dark',
    image: true,
  };
}

export function resolveSurface(surface: SurfaceAppearance, role: 'hero' | 'sidebar'): ResolvedSurface {
  if (role === 'hero') {
    if (surface.kind === 'custom' && surface.customDataUrl) return heroImage(surface.customDataUrl);
    if (surface.kind === 'preset') {
      const preset = SURFACE_PRESETS.find((p) => p.id === surface.presetId) ?? SURFACE_PRESETS[0];
      return heroImage(preset.src);
    }
    return { background: HERO_SOLIDS[0].value, overlay: 'transparent', ink: 'dark', image: false };
  }
  if (surface.kind === 'custom' && surface.customDataUrl) {
    return {
      background: `center / cover no-repeat url("${surface.customDataUrl}")`,
      overlay: 'linear-gradient(180deg, rgb(15 23 42 / 0.38) 0%, rgb(15 23 42 / 0.55) 100%)',
      ink: 'light',
      image: true,
    };
  }
  if (surface.kind === 'preset') {
    const preset = SURFACE_PRESETS.find((p) => p.id === surface.presetId) ?? SURFACE_PRESETS[0];
    return {
      background: `center / cover no-repeat url("${preset.src}")`,
      overlay: 'linear-gradient(180deg, rgb(15 23 42 / 0.34) 0%, rgb(15 23 42 / 0.52) 100%)',
      ink: 'light',
      image: true,
    };
  }
  const solidId = normaliseSolidId('sidebar', surface.solidId);
  const value = findSolid(solidId, SIDEBAR_SOLIDS, SIDEBAR_SOLIDS[0].value);
  return {
    background: value,
    overlay: 'transparent',
    ink: solidId === 'navy' ? 'light' : 'dark',
    image: false,
  };
}

export function compressImageFile(file: File, maxEdge = 1400, quality = 0.74): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Choose an image file.'));
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not read image.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read image.'));
    };
    img.src = objectUrl;
  });
}
