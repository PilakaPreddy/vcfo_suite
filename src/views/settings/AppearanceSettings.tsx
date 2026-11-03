'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { Check, Upload } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useApp } from '@/context/AppContext';
import { internFirstName } from '@/lib/intern/intern-work';
import {
  HERO_SOLIDS,
  MOTION_STYLES,
  SIDEBAR_SOLIDS,
  SURFACE_PRESETS,
  compressImageFile,
  surfaceCssVars,
  type MotionStyle,
  type SurfaceAppearance,
  type SurfaceKind,
} from '@/lib/shell/shell-appearance';
import { useShellAppearance } from '@/hooks/use-shell-appearance';
import { toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import {
  applyAppearanceAttributes,
  readPersonDensity,
  readTextSize,
  writePersonDensity,
  writeTextSize,
  type Density,
  type TextSize,
} from '@/lib/ui/table-prefs';
import { ProfileCard, SettingsRow } from '@/views/settings/account/settings-layout';

const KINDS: { id: SurfaceKind; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'preset', label: 'Images' },
  { id: 'custom', label: 'Upload' },
];

function Swatch({
  selected,
  label,
  style,
  onClick,
  dense = false,
  caption = false,
}: {
  selected: boolean;
  label: string;
  style: CSSProperties;
  onClick: () => void;
  dense?: boolean;
  caption?: boolean;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      data-on={selected ? 'true' : 'false'}
      className={
        dense
          ? cn(
              'relative h-8 w-full overflow-hidden rounded-md ring-1 ring-line-strong transition-[transform,box-shadow] hover:-translate-y-px',
              selected && 'ring-2 ring-brand ring-offset-1 ring-offset-popover',
            )
          : 'appear-swatch group'
      }
      style={style}
    >
      {selected ? (
        <span className="absolute inset-0 grid place-items-center bg-black/15">
          <span
            className={cn(
              'grid place-items-center rounded-full bg-surface-raised text-ink',
              dense ? 'h-4 w-4' : 'h-5 w-5',
            )}
          >
            <Check className={dense ? 'h-2.5 w-2.5' : 'h-3 w-3'} strokeWidth={3} />
          </span>
        </span>
      ) : dense || caption ? null : (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/35 px-1.5 py-0.5 text-[11px] font-medium text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
          {label}
        </span>
      )}
    </button>
  );

  if (dense || !caption) return button;

  return (
    <div className="min-w-0 space-y-1.5">
      {button}
      <p
        className={cn(
          'truncate text-center text-[11px] tracking-tight',
          selected ? 'font-medium text-ink' : 'text-ink-muted',
        )}
      >
        {label}
      </p>
    </div>
  );
}

function KindTabs({
  value,
  onChange,
}: {
  value: SurfaceKind;
  onChange: (kind: SurfaceKind) => void;
  dense?: boolean;
}) {
  return (
    <SpectrumTabs
      label="Background kind"
      items={KINDS.map((k) => ({ key: k.id, label: k.label }))}
      value={value}
      onChange={(k) => onChange(k as SurfaceKind)}
    />
  );
}

function SurfacePicker({
  value,
  solids,
  onChange,
  dense = false,
}: {
  value: SurfaceAppearance;
  solids: readonly { id: string; label: string; value: string }[];
  onChange: (patch: Partial<SurfaceAppearance>) => void;
  dense?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const customDataUrl = await compressImageFile(file);
      onChange({ kind: 'custom', customDataUrl });
    } catch (err) {
      toastError('Could not use that image', err instanceof Error ? err.message : 'Try another file.');
    }
  };

  return (
    <div className={dense ? 'space-y-2.5' : 'mt-4 space-y-3.5'}>
      <KindTabs dense={dense} value={value.kind} onChange={(kind) => onChange({ kind })} />

      {value.kind === 'solid' ? (
        <div className={dense ? 'grid grid-cols-8 gap-1.5' : 'grid grid-cols-4 gap-2 sm:grid-cols-8'}>
          {solids.map((solid) => (
            <Swatch
              key={solid.id}
              dense={dense}
              label={solid.label}
              selected={value.solidId === solid.id}
              style={{ background: solid.value }}
              onClick={() => onChange({ kind: 'solid', solidId: solid.id })}
            />
          ))}
        </div>
      ) : null}

      {value.kind === 'preset' ? (
        <div className={dense ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-3 gap-2.5 sm:grid-cols-6'}>
          {SURFACE_PRESETS.map((preset) => (
            <Swatch
              key={preset.id}
              dense={dense}
              caption={!dense}
              label={preset.label}
              selected={value.presetId === preset.id}
              style={{
                backgroundImage: `url(${preset.src})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                height: dense ? 40 : 72,
              }}
              onClick={() => onChange({ kind: 'preset', presetId: preset.id })}
            />
          ))}
        </div>
      ) : null}

      {value.kind === 'custom' ? (
        <div className={cn('flex items-center', dense ? 'gap-2.5' : 'gap-3')}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={
              dense
                ? 'relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-sunken ring-1 ring-line-strong'
                : cn(
                    'appear-swatch flex h-16 w-24 shrink-0 items-center justify-center text-ink-muted',
                    value.customDataUrl && 'data-on',
                  )
            }
            style={
              value.customDataUrl
                ? {
                    backgroundImage: `url(${value.customDataUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : dense
                  ? undefined
                  : { background: 'oklch(var(--muted))' }
            }
            data-on={value.customDataUrl ? 'true' : 'false'}
            aria-label={value.customDataUrl ? 'Replace photo' : 'Upload photo'}
          >
            {!value.customDataUrl ? (
              <Upload className={cn('text-ink-muted', dense ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
            ) : null}
          </button>
          <div className="min-w-0">
            <p className={cn('font-medium text-ink', dense ? 'text-[12px]' : 'text-[13px]')}>
              Your image
            </p>
            {dense ? null : (
              <p className="mt-0.5 text-[12.5px] text-ink-muted">JPEG or PNG</p>
            )}
            <button
              type="button"
              className={cn(
                'font-medium text-brand-text hover:underline',
                dense ? 'mt-0.5 text-[11.5px]' : 'mt-1.5 text-[12px]',
              )}
              onClick={() => fileRef.current?.click()}
            >
              {value.customDataUrl ? (dense ? 'Replace' : 'Replace photo') : dense ? 'Upload' : 'Upload photo'}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

const THEMES = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
];

const DENSITIES = [
  { key: 'comfortable', label: 'Comfortable' },
  { key: 'compact', label: 'Compact' },
];

const TEXT_SIZES = [
  { key: 'small', label: 'Small' },
  { key: 'default', label: 'Default' },
  { key: 'large', label: 'Large' },
];

/** Light, dark or the device setting (next-themes keeps the choice in the browser). */
function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // The theme is only known in the browser; render a grey shape until then (R-48).
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="block h-[30px] w-48 animate-pulse rounded-md bg-surface-sunken" aria-hidden />;
  return <SpectrumTabs label="Theme" items={THEMES} value={theme ?? 'light'} onChange={setTheme} />;
}

/**
 * Profile › Appearance (VCFO Spectrum, prototype AppearanceCard). The theme, the greeting card and
 * sidebar backgrounds, density, text size and motion. Every choice saves at once.
 */
export function AppearanceSettings() {
  const { user } = useApp();
  const { prefs, hero, sidebar, patchHero, patchSidebar, update } = useShellAppearance();
  const first = internFirstName(user?.name);
  // Density and text size are per person and per browser; they go on <html> at once.
  const [density, setDensity] = useState<Density>('comfortable');
  const [textSize, setTextSize] = useState<TextSize>('default');
  useEffect(() => {
    setDensity(readPersonDensity());
    setTextSize(readTextSize());
  }, []);
  const pickDensity = (d: Density) => {
    setDensity(d);
    writePersonDensity(d);
    applyAppearanceAttributes(d, textSize);
  };
  const pickTextSize = (t: TextSize) => {
    setTextSize(t);
    writeTextSize(t);
    applyAppearanceAttributes(density, t);
  };

  return (
    <ProfileCard id="appearance" title="Appearance">
      <SettingsRow label="Theme">
        <ThemePicker />
      </SettingsRow>

      <StudioBlock title="Greeting card">
        <div
          className="bg-wash rounded-md border-1.5 border-line px-5 py-4"
          data-hero-image={hero.image ? 'true' : 'false'}
          style={hero.image ? (surfaceCssVars(hero, 'hero') as CSSProperties) : undefined}
        >
          <div className="min-w-0">
            <p className="text-[12px] text-wash-ink-2">Preview</p>
            <p className="mt-1.5 text-[20px] font-medium leading-tight text-ink">Good morning, {first}</p>
            <div className="mt-3.5 flex gap-2.5 text-[12.5px] text-ink-2">
              <span className="wash-tile px-3 py-2">
                <b className="text-[15px] font-medium tabular-nums text-ink">12</b> Action
              </span>
              <span className="wash-tile px-3 py-2">
                <b className="text-[15px] font-medium tabular-nums text-danger">2</b> Overdue
              </span>
              <span className="wash-tile hidden px-3 py-2 sm:inline">
                <b className="text-[15px] font-medium tabular-nums text-ink">4</b> Waiting
              </span>
            </div>
          </div>
        </div>
        <SurfacePicker value={prefs.hero} solids={HERO_SOLIDS} onChange={patchHero} />
      </StudioBlock>

      <StudioBlock title="Sidebar">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div
            className="shell-sidebar-skin relative h-[176px] w-[104px] shrink-0 overflow-hidden rounded-md border-1.5 border-line"
            data-ink={sidebar.ink}
            style={surfaceCssVars(sidebar, 'sidebar')}
          >
            <div className="relative z-[1] space-y-1.5 p-2.5">
              <div className="h-1.5 w-10 rounded-full bg-current opacity-80" />
              <div className="h-6 rounded-md bg-current opacity-[0.12] ring-1 ring-current/20" />
              <div className="h-5 rounded-md bg-current opacity-[0.08]" />
              <div className="h-5 rounded-md bg-current opacity-[0.08]" />
              <div className="h-5 rounded-md bg-current opacity-[0.08]" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <SurfacePicker value={prefs.sidebar} solids={SIDEBAR_SOLIDS} onChange={patchSidebar} />
          </div>
        </div>
      </StudioBlock>

      <SettingsRow label="Density">
        <SpectrumTabs label="Density" items={DENSITIES} value={density} onChange={(v) => pickDensity(v as Density)} />
      </SettingsRow>
      <SettingsRow label="Text size">
        <SpectrumTabs label="Text size" items={TEXT_SIZES} value={textSize} onChange={(v) => pickTextSize(v as TextSize)} />
      </SettingsRow>

      <SettingsRow label="Animations">
        <SpectrumTabs
          label="Animations"
          items={MOTION_STYLES.map((style) => ({ key: style.id, label: style.label }))}
          value={prefs.motion}
          onChange={(next) => update({ motion: next as MotionStyle })}
        />
      </SettingsRow>
      <SettingsRow label="Reduce motion">
        <Switch
          checked={prefs.reduceMotion}
          onCheckedChange={(checked) => update({ reduceMotion: checked })}
          aria-label="Reduce motion"
        />
      </SettingsRow>
    </ProfileCard>
  );
}

/** A full-width block inside the Appearance card, for the pickers that need room. */
function StudioBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-line-soft px-4 py-4 first:border-t-0 md:px-5">
      <h3 className="text-[14px] font-medium text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}
