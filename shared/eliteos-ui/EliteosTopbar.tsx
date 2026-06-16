import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./eliteosTopbar.css";

const MENU_WIDTH_PX = 248;
const MENU_CHIP_GAP_PX = 8;
const MENU_VIEWPORT_PAD_PX = 8;

/**
 * eliteOS shared topbar — the canonical app-shell header.
 *
 * PURELY PRESENTATIONAL. This component intentionally knows nothing about
 * Supabase, backend APIs, env vars, auth/session, permissions, routing, or any
 * specific head's domain logic (quotes, pricing, etc.). Every piece of data and
 * every action is supplied by the consuming app through props/slots. The only
 * state it owns is the local open/closed UI state of the account dropdown.
 *
 * Visual source of truth: the Home Launcher topbar.
 */
export type EliteosTopbarMenuItem = {
  label: string;
  /** Optional secondary line under the label. */
  meta?: string;
  /** Optional leading icon (caller supplies the SVG/node). */
  icon?: ReactNode;
  /** When set, the item renders as an anchor (full navigation). */
  href?: string;
  /** Click handler. For anchors this fires in addition to navigation. */
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "default" | "danger";
};

export type EliteosTopbarProps = {
  /** Head name, e.g. "Quote Library". Omit for Home. */
  appName?: string;
  /** Workspace / organization display name, e.g. "Elite Stone Fabrication". */
  organizationName: string;
  /** Brand logo URL. Falls back to an empty mark tile when absent. */
  logoSrc?: string;
  /** Brand link target. When omitted the brand renders as static text. */
  homeHref?: string;

  userName?: string;
  userEmail?: string;
  /** Chip subtitle. Falls back to userEmail when undefined; pass "" to hide. */
  userSubtitle?: string;
  initials?: string;

  /** Home-only head finder / search control. Renders only when provided. */
  searchSlot?: ReactNode;
  /** Optional per-head primary action (reserved for later heads). */
  primaryActionSlot?: ReactNode;
  /** Optional per-head status content (reserved for later heads). */
  statusSlot?: ReactNode;

  menuItems?: EliteosTopbarMenuItem[];
  onSignOut?: () => void;
  signOutLabel?: string;
};

function ChevronIcon() {
  return (
    <svg
      className="eliteos-topbar-chip-chevron"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function EliteosTopbar({
  appName,
  organizationName,
  logoSrc,
  homeHref,
  userName,
  userEmail,
  userSubtitle,
  initials,
  searchSlot,
  primaryActionSlot,
  statusSlot,
  menuItems,
  onSignOut,
  signOutLabel = "Sign out"
}: EliteosTopbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const userRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const subtitle =
    appName && appName.trim() ? `${appName.trim()} · ${organizationName}` : organizationName;
  const chipSubtitle = userSubtitle !== undefined ? userSubtitle : userEmail ?? "";
  const showUserChip = Boolean(initials || userName);
  const hasMenu = Boolean((menuItems && menuItems.length) || onSignOut);
  const brandAriaLabel = `eliteOS${appName && appName.trim() ? ` ${appName.trim()}` : ""} — ${organizationName}`;

  const updateMenuPosition = useCallback(() => {
    const chip = chipRef.current;
    if (!chip) return;

    const rect = chip.getBoundingClientRect();
    let left = rect.right - MENU_WIDTH_PX;
    left = Math.max(
      MENU_VIEWPORT_PAD_PX,
      Math.min(left, window.innerWidth - MENU_WIDTH_PX - MENU_VIEWPORT_PAD_PX)
    );

    let top = rect.bottom + MENU_CHIP_GAP_PX;
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    if (menuHeight > 0) {
      const maxTop = window.innerHeight - menuHeight - MENU_VIEWPORT_PAD_PX;
      top = Math.min(top, Math.max(MENU_VIEWPORT_PAD_PX, maxTop));
    }

    setMenuPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    updateMenuPosition();
    const raf = requestAnimationFrame(updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    window.addEventListener("resize", updateMenuPosition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", updateMenuPosition, true);
      window.removeEventListener("resize", updateMenuPosition);
    };
  }, [menuOpen, updateMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (userRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const menuPanel =
    menuOpen && hasMenu ? (
      <div
        ref={menuRef}
        className="eliteos-topbar-menu eliteos-topbar-menu--portal"
        role="menu"
        aria-label="Account menu"
        style={{ top: menuPosition.top, left: menuPosition.left }}
      >
        <div className="eliteos-topbar-menu-header">
          {userName ? <p className="eliteos-topbar-menu-name">{userName}</p> : null}
          {userEmail ? <p className="eliteos-topbar-menu-email">{userEmail}</p> : null}
          <p className="eliteos-topbar-menu-workspace">
            Workspace · {organizationName} · on eliteOS
          </p>
        </div>

        {menuItems && menuItems.length ? (
          <div className="eliteos-topbar-menu-body">
            {menuItems.map((item, i) => {
              const itemClass = `eliteos-topbar-menu-item${
                item.variant === "danger" ? " eliteos-topbar-menu-item-danger" : ""
              }`;
              const inner = (
                <>
                  {item.icon ? (
                    <span className="eliteos-topbar-menu-icon" aria-hidden>
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="eliteos-topbar-menu-label">
                    <span>{item.label}</span>
                    {item.meta ? (
                      <span className="eliteos-topbar-menu-meta">{item.meta}</span>
                    ) : null}
                  </span>
                </>
              );

              if (item.href && !item.disabled) {
                return (
                  <a
                    key={i}
                    href={item.href}
                    className={itemClass}
                    role="menuitem"
                    title={item.title}
                    onClick={() => {
                      setMenuOpen(false);
                      item.onClick?.();
                    }}
                  >
                    {inner}
                  </a>
                );
              }

              return (
                <button
                  key={i}
                  type="button"
                  className={itemClass}
                  role="menuitem"
                  title={item.title}
                  disabled={item.disabled}
                  onClick={() => {
                    setMenuOpen(false);
                    item.onClick?.();
                  }}
                >
                  {inner}
                </button>
              );
            })}
          </div>
        ) : null}

        {onSignOut ? (
          <div className="eliteos-topbar-menu-footer">
            <button
              type="button"
              className="eliteos-topbar-menu-item eliteos-topbar-menu-item-danger"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
            >
              <span className="eliteos-topbar-menu-icon" aria-hidden>
                <SignOutIcon />
              </span>
              <span className="eliteos-topbar-menu-label">{signOutLabel}</span>
            </button>
          </div>
        ) : null}
      </div>
    ) : null;

  const brandInner = (
    <>
      <span className="eliteos-topbar-mark" aria-hidden>
        {logoSrc ? <img src={logoSrc} alt="" /> : null}
      </span>
      <span className="eliteos-topbar-brand-text">
        <span className="eliteos-topbar-wordmark">eliteOS</span>
        <span className="eliteos-topbar-sub">{subtitle}</span>
      </span>
    </>
  );

  return (
    <header className="eliteos-topbar" role="banner">
      {homeHref ? (
        <a href={homeHref} className="eliteos-topbar-brand eliteos-topbar-brand-link" aria-label={brandAriaLabel}>
          {brandInner}
        </a>
      ) : (
        <div className="eliteos-topbar-brand" aria-label={brandAriaLabel}>
          {brandInner}
        </div>
      )}

      {searchSlot ?? null}

      <div className="eliteos-topbar-actions">
        {statusSlot ?? null}
        {primaryActionSlot ?? null}

        {showUserChip ? (
          <div className="eliteos-topbar-user" ref={userRef}>
            <button
              ref={chipRef}
              type="button"
              className="eliteos-topbar-chip"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className="eliteos-topbar-chip-avatar" aria-hidden>
                {initials}
              </span>
              <span className="eliteos-topbar-chip-text">
                {userName ? <span className="eliteos-topbar-chip-name">{userName}</span> : null}
                {chipSubtitle ? <span className="eliteos-topbar-chip-role">{chipSubtitle}</span> : null}
              </span>
              <ChevronIcon />
            </button>

          </div>
        ) : null}
      </div>

      {typeof document !== "undefined" && menuPanel
        ? createPortal(menuPanel, document.body)
        : null}
    </header>
  );
}
