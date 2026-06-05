/**
 * Accessibility Widget
 *
 * A production-ready, WCAG 2.1 AA-compliant floating accessibility panel.
 * Implements: text scaling, contrast modes, readable font, dyslexia support,
 * large cursor, large targets, focus/heading/landmark highlighting, motion
 * controls, keyboard navigation, profile presets, and full persistence.
 *
 * All controls modify the live DOM via CSS classes on <html> and are instantly
 * effective. State is persisted to localStorage (key: accessibilityPreferences.v1).
 * A boot script in index.html re-applies settings before React renders to prevent
 * any flash of incorrect state.
 */

import { createPortal } from "react-dom"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import {
  AlignLeft,
  Accessibility,
  BookOpen,
  Eye,
  FileText,
  Highlighter,
  Keyboard,
  Map,
  Maximize2,
  MousePointer2,
  Palette,
  PauseCircle,
  RotateCcw,
  Settings2,
  StopCircle,
  SunMoon,
  Target,
  Type,
  Underline,
  X,
  ZapOff,
  Heading1,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type ContrastMode = "default" | "high"
type ProfileType =
  | "default"
  | "motor"
  | "blind"
  | "colorblind"
  | "dyslexia"
  | "custom"
type ButtonPlacement =
  | "bottom-right"
  | "bottom-left"
  | "middle-right"
  | "middle-left"
  | "top-right"
  | "top-left"

interface A11yPreferences {
  version: 1
  textScaleIndex: number
  contrast: ContrastMode
  underlineLinks: boolean
  highlightLinks: boolean
  readableFont: boolean
  dyslexiaFriendly: boolean
  largeCursor: boolean
  largeTargets: boolean
  highlightFocus: boolean
  highlightHeadings: boolean
  highlightLandmarks: boolean
  reduceMotion: boolean
  pauseAnimations: boolean
  stopCarousels: boolean
  keyboardNav: boolean
  profile: ProfileType
  buttonPlacement: ButtonPlacement
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TEXT_SCALE_LEVELS = [0.9, 1, 1.1, 1.25, 1.5, 1.75, 2.0] as const
const TEXT_SCALE_LABELS = ["90%", "100%", "110%", "125%", "150%", "175%", "200%"]
const STORAGE_KEY = "accessibilityPreferences.v1"

const DEFAULT_PREFS: A11yPreferences = {
  version: 1,
  textScaleIndex: 1,
  contrast: "default",
  underlineLinks: false,
  highlightLinks: false,
  readableFont: false,
  dyslexiaFriendly: false,
  largeCursor: false,
  largeTargets: false,
  highlightFocus: false,
  highlightHeadings: false,
  highlightLandmarks: false,
  reduceMotion: false,
  pauseAnimations: false,
  stopCarousels: false,
  keyboardNav: false,
  profile: "default",
  buttonPlacement: "bottom-right",
}

type ProfileKey = Exclude<ProfileType, "custom" | "default">

const PROFILE_SETTINGS: Record<ProfileKey, Partial<A11yPreferences>> = {
  motor: {
    largeTargets: true,
    highlightFocus: true,
    reduceMotion: true,
    stopCarousels: true,
    keyboardNav: true,
  },
  blind: {
    keyboardNav: true,
    highlightFocus: true,
    largeTargets: true,
  },
  colorblind: {
    contrast: "high",
    underlineLinks: true,
  },
  dyslexia: {
    readableFont: true,
    dyslexiaFriendly: true,
    reduceMotion: true,
  },
}

const PROFILE_LABELS: Record<ProfileType, string> = {
  default: "Default",
  motor: "Motor Impaired",
  blind: "Vision Support",
  colorblind: "Colour Blind",
  dyslexia: "Dyslexia",
  custom: "Custom",
}

// ─── DOM Application ──────────────────────────────────────────────────────────

function applyPreferencesToDom(prefs: A11yPreferences): void {
  const html = document.documentElement

  const set = (cls: string, on: boolean) => html.classList.toggle(cls, on)

  set("a11y-high-contrast", prefs.contrast === "high")
  set("a11y-underline-links", prefs.underlineLinks)
  set("a11y-highlight-links", prefs.highlightLinks)
  set("a11y-readable-font", prefs.readableFont)
  set("a11y-dyslexia", prefs.dyslexiaFriendly)
  set("a11y-large-cursor", prefs.largeCursor)
  set("a11y-large-targets", prefs.largeTargets)
  set("a11y-highlight-focus", prefs.highlightFocus)
  set("a11y-highlight-headings", prefs.highlightHeadings)
  set("a11y-highlight-landmarks", prefs.highlightLandmarks)
  set("a11y-reduce-motion", prefs.reduceMotion)
  set("a11y-pause-animations", prefs.pauseAnimations)
  set("a11y-stop-carousels", prefs.stopCarousels)
  set("a11y-keyboard-nav", prefs.keyboardNav)

  const scale = TEXT_SCALE_LEVELS[prefs.textScaleIndex] ?? 1
  if (scale !== 1) {
    html.style.setProperty("--a11y-font-scale", String(scale))
    html.classList.add("a11y-scaled")
  } else {
    html.style.removeProperty("--a11y-font-scale")
    html.classList.remove("a11y-scaled")
  }
}

function removeAllA11yClasses(): void {
  const html = document.documentElement
  const classes = [
    "a11y-high-contrast",
    "a11y-underline-links",
    "a11y-highlight-links",
    "a11y-readable-font",
    "a11y-dyslexia",
    "a11y-large-cursor",
    "a11y-large-targets",
    "a11y-highlight-focus",
    "a11y-highlight-headings",
    "a11y-highlight-landmarks",
    "a11y-reduce-motion",
    "a11y-pause-animations",
    "a11y-stop-carousels",
    "a11y-keyboard-nav",
    "a11y-scaled",
  ]
  classes.forEach((c) => html.classList.remove(c))
  html.style.removeProperty("--a11y-font-scale")
}

// ─── State Hook ───────────────────────────────────────────────────────────────

function useA11yState() {
  const [prefs, setPrefsRaw] = useState<A11yPreferences>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<A11yPreferences>
        if (parsed.version === 1) {
          return { ...DEFAULT_PREFS, ...parsed }
        }
      }
    } catch {
      // storage unavailable or corrupted — use defaults
    }
    return { ...DEFAULT_PREFS }
  })

  // Apply DOM changes on every pref update
  useEffect(() => {
    applyPreferencesToDom(prefs)
  }, [prefs])

  // Persist to localStorage on every pref update
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch {
      // private browsing / quota exceeded — silently ignore
    }
  }, [prefs])

  const setPrefs = useCallback(
    (
      updater: Partial<A11yPreferences> | ((p: A11yPreferences) => A11yPreferences)
    ) => {
      setPrefsRaw((prev) =>
        typeof updater === "function"
          ? updater(prev)
          : { ...prev, ...updater }
      )
    },
    []
  )

  const toggleBool = useCallback((key: keyof A11yPreferences) => {
    setPrefsRaw((prev) => ({
      ...prev,
      [key]: !prev[key],
      profile: "custom" as ProfileType,
    }))
  }, [])

  const toggleContrast = useCallback(() => {
    setPrefsRaw((prev) => ({
      ...prev,
      contrast: prev.contrast === "high" ? "default" : "high",
      profile: "custom" as ProfileType,
    }))
  }, [])

  const increaseText = useCallback(() => {
    setPrefsRaw((prev) => ({
      ...prev,
      textScaleIndex: Math.min(prev.textScaleIndex + 1, TEXT_SCALE_LEVELS.length - 1),
    }))
  }, [])

  const decreaseText = useCallback(() => {
    setPrefsRaw((prev) => ({
      ...prev,
      textScaleIndex: Math.max(prev.textScaleIndex - 1, 0),
    }))
  }, [])

  const resetTextScale = useCallback(() => {
    setPrefsRaw((prev) => ({ ...prev, textScaleIndex: 1 }))
  }, [])

  const applyProfile = useCallback(
    (profile: ProfileType, currentPlacement: ButtonPlacement) => {
      if (profile === "custom") return

      if (profile === "default") {
        removeAllA11yClasses()
        setPrefsRaw({ ...DEFAULT_PREFS, profile: "default", buttonPlacement: currentPlacement })
        return
      }

      const settings = PROFILE_SETTINGS[profile as ProfileKey]
      setPrefsRaw({
        ...DEFAULT_PREFS,
        ...settings,
        profile,
        buttonPlacement: currentPlacement,
      })
    },
    []
  )

  const resetAll = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    removeAllA11yClasses()
    setPrefsRaw({ ...DEFAULT_PREFS })
  }, [])

  return {
    prefs,
    setPrefs,
    toggleBool,
    toggleContrast,
    increaseText,
    decreaseText,
    resetTextScale,
    applyProfile,
    resetAll,
  }
}

// ─── Background-aware FAB Tone Detection ─────────────────────────────────────

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function parseBgLuminance(el: Element | null): number | null {
  while (el && el !== document.documentElement) {
    const bg = window.getComputedStyle(el as HTMLElement).backgroundColor
    if (bg && bg !== "transparent" && !bg.startsWith("rgba(0, 0, 0, 0)")) {
      const m = bg.match(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/)
      if (m) {
        return relativeLuminance(Number(m[1]), Number(m[2]), Number(m[3]))
      }
    }
    el = el.parentElement
  }
  return null
}

function detectFabTone(fabEl: HTMLElement | null): "light" | "dark" {
  if (!fabEl) return "dark"

  const rect = fabEl.getBoundingClientRect()
  const cx = Math.round(rect.left + rect.width / 2)
  const cy = Math.round(rect.top + rect.height / 2)

  // Temporarily hide FAB so we can detect what's behind it
  const prevVis = fabEl.style.visibility
  fabEl.style.visibility = "hidden"
  const behind = document.elementFromPoint(cx, cy)
  fabEl.style.visibility = prevVis

  const lum = parseBgLuminance(behind)
  if (lum !== null) return lum > 0.35 ? "light" : "dark"

  // Fallback: body background
  const bodyLum = parseBgLuminance(document.body)
  if (bodyLum !== null) return bodyLum > 0.35 ? "light" : "dark"

  return "dark" // safe default → blue button with white icon
}

function useFabTone(
  fabRef: { current: HTMLButtonElement | null },
  panelOpen: boolean
) {
  const [tone, setTone] = useState<"light" | "dark">("dark")
  const rafId = useRef<number | null>(null)

  const detect = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      setTone(detectFabTone(fabRef.current))
    })
  }, [fabRef])

  useEffect(() => {
    detect()
    window.addEventListener("scroll", detect, { passive: true })
    window.addEventListener("resize", detect, { passive: true })
    return () => {
      window.removeEventListener("scroll", detect)
      window.removeEventListener("resize", detect)
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [detect, panelOpen])

  return tone
}

// ─── Focus Trap ───────────────────────────────────────────────────────────────

const FOCUSABLE =
  'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function useFocusTrap(
  active: boolean,
  containerRef: { current: HTMLElement | null }
) {
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    prevFocusRef.current = document.activeElement as HTMLElement

    const els = () =>
      Array.from(containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => !el.closest('[aria-hidden="true"]')
      )

    // Move focus into the panel on open
    const first = els()[0]
    if (first) {
      setTimeout(() => first.focus(), 20)
    }

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Tab") return
      const list = els()
      if (!list.length) return
      const firstEl = list[0]
      const lastEl = list[list.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      // Return focus to the element that had it before the panel opened
      if (prevFocusRef.current && typeof prevFocusRef.current.focus === "function") {
        prevFocusRef.current.focus()
      }
    }
  }, [active, containerRef])
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ControlCardProps {
  label: string
  icon: React.ReactNode
  active: boolean
  onToggle: () => void
}

function ControlCard({ label, icon, active, onToggle }: ControlCardProps) {
  const handleKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onToggle()
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      onKeyDown={handleKey}
      className={`a11y-control-card${active ? " is-active" : ""}`}
    >
      {active && (
        <span className="a11y-on-badge" aria-hidden="true">
          ON
        </span>
      )}
      <span className="a11y-control-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="a11y-control-label">{label}</span>
    </button>
  )
}

interface ProfileCardProps {
  label: string
  icon: React.ReactNode
  active: boolean
  onSelect: () => void
}

function ProfileCard({ label, icon, active, onSelect }: ProfileCardProps) {
  const handleKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onSelect()
    }
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={handleKey}
      className={`a11y-profile-card${active ? " is-active" : ""}`}
    >
      <span className="a11y-profile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="a11y-profile-name">{label}</span>
    </button>
  )
}

interface TextScaleControlProps {
  scaleIndex: number
  onIncrease: () => void
  onDecrease: () => void
  onReset: () => void
}

function TextScaleControl({
  scaleIndex,
  onIncrease,
  onDecrease,
  onReset,
}: TextScaleControlProps) {
  const atMin = scaleIndex === 0
  const atMax = scaleIndex === TEXT_SCALE_LEVELS.length - 1
  const atDefault = scaleIndex === 1
  const fillPct = (scaleIndex / (TEXT_SCALE_LEVELS.length - 1)) * 100
  const currentLabel = TEXT_SCALE_LABELS[scaleIndex]

  return (
    <div className="a11y-text-scale-card" role="group" aria-label="Text size adjustment">
      <div className="a11y-text-scale-header">
        <div className="a11y-text-scale-title">
          <Type size={15} aria-hidden="true" />
          Text Size
        </div>
        <button
          type="button"
          className="a11y-scale-reset-link"
          onClick={onReset}
          disabled={atDefault}
          aria-label="Reset text size to 100%"
        >
          Reset
        </button>
      </div>

      <div className="a11y-text-scale-controls">
        <button
          type="button"
          className="a11y-scale-btn"
          onClick={onDecrease}
          disabled={atMin}
          aria-label="Decrease text size"
        >
          <span aria-hidden="true">−</span>
        </button>

        <div className="a11y-scale-track-wrap">
          <div className="a11y-scale-track" role="presentation">
            <div
              className="a11y-scale-fill"
              style={{ width: `${fillPct}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="a11y-scale-labels" aria-hidden="true">
            <span>90%</span>
            <span>200%</span>
          </div>
        </div>

        <span
          className="a11y-scale-current"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`Current text size: ${currentLabel}`}
        >
          {currentLabel}
        </span>

        <button
          type="button"
          className="a11y-scale-btn"
          onClick={onIncrease}
          disabled={atMax}
          aria-label="Increase text size"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  )
}

// ─── Accessibility Panel ──────────────────────────────────────────────────────

interface PanelProps {
  isOpen: boolean
  prefs: A11yPreferences
  onClose: () => void
  onToggleBool: (key: keyof A11yPreferences) => void
  onToggleContrast: () => void
  onApplyProfile: (p: ProfileType) => void
  onIncreaseText: () => void
  onDecreaseText: () => void
  onResetText: () => void
  onResetAll: () => void
}

function AccessibilityPanel({
  isOpen,
  prefs,
  onClose,
  onToggleBool,
  onToggleContrast,
  onApplyProfile,
  onIncreaseText,
  onDecreaseText,
  onResetText,
  onResetAll,
}: PanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useFocusTrap(isOpen, panelRef)

  // Escape closes panel
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener("keydown", handler, true)
    return () => document.removeEventListener("keydown", handler, true)
  }, [isOpen, onClose])

  const profileIcon: Record<ProfileType, React.ReactNode> = {
    motor: <Accessibility size={18} />,
    blind: <Eye size={18} />,
    colorblind: <Palette size={18} />,
    dyslexia: <FileText size={18} />,
    default: <RotateCcw size={18} />,
    custom: <Settings2 size={18} />,
  }

  const profilesToShow: ProfileType[] =
    prefs.profile === "custom"
      ? ["motor", "blind", "colorblind", "dyslexia", "default", "custom"]
      : ["motor", "blind", "colorblind", "dyslexia", "default"]

  return (
    <div
      ref={panelRef}
      id="a11y-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="a11y-panel-title"
      aria-describedby="a11y-panel-desc"
      className={`a11y-panel${isOpen ? " is-open" : ""}`}
      aria-hidden={!isOpen}
    >
      {/* ── Header ── */}
      <header className="a11y-panel-header">
        <div className="a11y-panel-header-row">
          <div className="a11y-panel-title-group">
            <Accessibility size={20} color="white" aria-hidden="true" />
            <h2 id="a11y-panel-title" className="a11y-panel-title">
              Accessibility
            </h2>
          </div>
          <button
            type="button"
            className="a11y-close-btn"
            onClick={onClose}
            aria-label="Close accessibility menu"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p id="a11y-panel-desc" className="a11y-panel-subtitle">
          Adjust this app to make it easier to read, navigate, and use.
        </p>
        {prefs.profile !== "default" && (
          <div className="a11y-active-profile-pill" aria-live="polite" role="status">
            <span aria-hidden="true">✓</span>
            {PROFILE_LABELS[prefs.profile]} profile active
          </div>
        )}
      </header>

      {/* ── Body ── */}
      <div className="a11y-panel-body">

        {/* Profiles */}
        <p className="a11y-section-label" id="a11y-profiles-label">
          Accessibility Profiles
        </p>
        <div
          className="a11y-profiles-grid"
          role="group"
          aria-labelledby="a11y-profiles-label"
        >
          {profilesToShow.map((p) => (
            <ProfileCard
              key={p}
              label={PROFILE_LABELS[p]}
              icon={profileIcon[p]}
              active={prefs.profile === p}
              onSelect={() => onApplyProfile(p)}
            />
          ))}
        </div>

        {/* Visual Adjustments */}
        <p className="a11y-section-label" id="a11y-visual-label">
          Visual
        </p>
        <div
          className="a11y-controls-grid"
          role="group"
          aria-labelledby="a11y-visual-label"
        >
          <TextScaleControl
            scaleIndex={prefs.textScaleIndex}
            onIncrease={onIncreaseText}
            onDecrease={onDecreaseText}
            onReset={onResetText}
          />
          <ControlCard
            label="High Contrast"
            icon={<SunMoon size={20} />}
            active={prefs.contrast === "high"}
            onToggle={onToggleContrast}
          />
          <ControlCard
            label="Underline Links"
            icon={<Underline size={20} />}
            active={prefs.underlineLinks}
            onToggle={() => onToggleBool("underlineLinks")}
          />
          <ControlCard
            label="Highlight Links"
            icon={<Highlighter size={20} />}
            active={prefs.highlightLinks}
            onToggle={() => onToggleBool("highlightLinks")}
          />
          <ControlCard
            label="Readable Font"
            icon={<BookOpen size={20} />}
            active={prefs.readableFont}
            onToggle={() => onToggleBool("readableFont")}
          />
          <ControlCard
            label="Dyslexia Friendly"
            icon={<AlignLeft size={20} />}
            active={prefs.dyslexiaFriendly}
            onToggle={() => onToggleBool("dyslexiaFriendly")}
          />
        </div>

        {/* Navigation & Interaction */}
        <p className="a11y-section-label" id="a11y-nav-label">
          Navigation & Interaction
        </p>
        <div
          className="a11y-controls-grid"
          role="group"
          aria-labelledby="a11y-nav-label"
        >
          <ControlCard
            label="Bigger Cursor"
            icon={<MousePointer2 size={20} />}
            active={prefs.largeCursor}
            onToggle={() => onToggleBool("largeCursor")}
          />
          <ControlCard
            label="Large Targets"
            icon={<Maximize2 size={20} />}
            active={prefs.largeTargets}
            onToggle={() => onToggleBool("largeTargets")}
          />
          <ControlCard
            label="Highlight Focus"
            icon={<Target size={20} />}
            active={prefs.highlightFocus}
            onToggle={() => onToggleBool("highlightFocus")}
          />
          <ControlCard
            label="Keyboard Nav"
            icon={<Keyboard size={20} />}
            active={prefs.keyboardNav}
            onToggle={() => onToggleBool("keyboardNav")}
          />
        </div>

        {/* Content Scanning */}
        <p className="a11y-section-label" id="a11y-scan-label">
          Content Scanning
        </p>
        <div
          className="a11y-controls-grid"
          role="group"
          aria-labelledby="a11y-scan-label"
        >
          <ControlCard
            label="Highlight Headings"
            icon={<Heading1 size={20} />}
            active={prefs.highlightHeadings}
            onToggle={() => onToggleBool("highlightHeadings")}
          />
          <ControlCard
            label="Highlight Landmarks"
            icon={<Map size={20} />}
            active={prefs.highlightLandmarks}
            onToggle={() => onToggleBool("highlightLandmarks")}
          />
        </div>

        {/* Motion & Animation */}
        <p className="a11y-section-label" id="a11y-motion-label">
          Motion & Animation
        </p>
        <div
          className="a11y-controls-grid"
          role="group"
          aria-labelledby="a11y-motion-label"
        >
          <ControlCard
            label="Reduce Motion"
            icon={<ZapOff size={20} />}
            active={prefs.reduceMotion}
            onToggle={() => onToggleBool("reduceMotion")}
          />
          <ControlCard
            label="Pause Animations"
            icon={<PauseCircle size={20} />}
            active={prefs.pauseAnimations}
            onToggle={() => onToggleBool("pauseAnimations")}
          />
          <ControlCard
            label="Stop Carousels"
            icon={<StopCircle size={20} />}
            active={prefs.stopCarousels}
            onToggle={() => onToggleBool("stopCarousels")}
          />
        </div>

        {/* Screen Reader Notice */}
        <div className="a11y-section-spacer" aria-hidden="true" />
        <div className="a11y-sr-notice" role="note" aria-label="Screen reader support information">
          <strong>Screen reader support:</strong> This app uses semantic HTML
          and ARIA to support VoiceOver, NVDA, JAWS, and TalkBack. Navigate
          with <kbd>Tab</kbd>, activate with <kbd>Enter</kbd> or <kbd>Space</kbd>.
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="a11y-panel-footer">
        <button
          type="button"
          className="a11y-reset-btn"
          onClick={onResetAll}
          aria-label="Reset all accessibility settings to their default values"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Reset all settings
        </button>
        <p className="a11y-footer-hint">
          Press <kbd>Esc</kbd> to close · Open with <kbd>Alt</kbd>+<kbd>A</kbd>
        </p>
      </footer>
    </div>
  )
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

export function AccessibilityWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const fabRef = useRef<HTMLButtonElement>(null)
  const announceRef = useRef<HTMLDivElement>(null)

  const {
    prefs,
    toggleBool,
    toggleContrast,
    increaseText,
    decreaseText,
    resetTextScale,
    applyProfile,
    resetAll,
  } = useA11yState()

  const bgTone = useFabTone(fabRef, isOpen)

  const openPanel = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closePanel = useCallback(() => {
    setIsOpen(false)
    // Focus returns to FAB (managed by useFocusTrap cleanup + fabRef)
    setTimeout(() => fabRef.current?.focus(), 20)
  }, [])

  // Global keyboard shortcut: Alt+A to open/close
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.altKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  // Click outside panel to close
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        !target.closest("#a11y-panel") &&
        !target.closest(".a11y-fab")
      ) {
        closePanel()
      }
    }
    // Delay one frame so the open-click doesn't immediately close
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handler)
    }
  }, [isOpen, closePanel])

  // Announce to screen readers (debounced via rAF)
  const announce = useCallback((message: string) => {
    if (!announceRef.current) return
    announceRef.current.textContent = ""
    requestAnimationFrame(() => {
      if (announceRef.current) announceRef.current.textContent = message
    })
  }, [])

  const handleToggleBool = useCallback(
    (key: keyof A11yPreferences) => {
      const current = prefs[key]
      toggleBool(key)
      announce(`${String(key)} ${!current ? "enabled" : "disabled"}`)
    },
    [toggleBool, prefs, announce]
  )

  const handleToggleContrast = useCallback(() => {
    const next = prefs.contrast !== "high"
    toggleContrast()
    announce(`High contrast ${next ? "enabled" : "disabled"}`)
  }, [toggleContrast, prefs.contrast, announce])

  const handleIncreaseText = useCallback(() => {
    const nextIdx = Math.min(prefs.textScaleIndex + 1, TEXT_SCALE_LEVELS.length - 1)
    increaseText()
    announce(`Text size: ${TEXT_SCALE_LABELS[nextIdx]}`)
  }, [increaseText, prefs.textScaleIndex])

  const handleDecreaseText = useCallback(() => {
    const nextIdx = Math.max(prefs.textScaleIndex - 1, 0)
    decreaseText()
    announce(`Text size: ${TEXT_SCALE_LABELS[nextIdx]}`)
  }, [decreaseText, prefs.textScaleIndex])

  const handleResetText = useCallback(() => {
    resetTextScale()
    announce("Text size reset to 100%")
  }, [resetTextScale, announce])

  const handleApplyProfile = useCallback(
    (profile: ProfileType) => {
      applyProfile(profile, prefs.buttonPlacement)
      announce(`${PROFILE_LABELS[profile]} profile applied`)
    },
    [applyProfile, prefs.buttonPlacement, announce]
  )

  const handleResetAll = useCallback(() => {
    resetAll()
    announce("All accessibility settings have been reset to defaults")
  }, [resetAll, announce])

  const fabClass = [
    "a11y-fab",
    `placement-${prefs.buttonPlacement}`,
    bgTone === "light" ? "fab-on-light" : "fab-on-dark",
  ].join(" ")

  return createPortal(
    <>
      {/* Skip to main content — always in DOM, visible on keyboard focus */}
      <a href="#root" className="a11y-skip-link">
        Skip to main content
      </a>

      {/* Polite live region for screen reader announcements */}
      <div
        ref={announceRef}
        className="a11y-live-region"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      />

      {/* Floating Action Button */}
      <button
        ref={fabRef}
        type="button"
        className={fabClass}
        onClick={openPanel}
        aria-label="Open accessibility options"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls="a11y-panel"
      >
        <Accessibility size={22} aria-hidden="true" />
        <span className="sr-only">Accessibility options</span>
      </button>

      {/* Accessibility Panel */}
      <AccessibilityPanel
        isOpen={isOpen}
        prefs={prefs}
        onClose={closePanel}
        onToggleBool={handleToggleBool}
        onToggleContrast={handleToggleContrast}
        onApplyProfile={handleApplyProfile}
        onIncreaseText={handleIncreaseText}
        onDecreaseText={handleDecreaseText}
        onResetText={handleResetText}
        onResetAll={handleResetAll}
      />
    </>,
    document.body
  )
}
