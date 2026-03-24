import { useEffect, useRef, useState } from "react";
import { Portal } from "./Portal.tsx";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  danger?: boolean;
  hint?: boolean;
  onClick?: () => void;
  submenu?: ContextMenuItem[];
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

function SubMenuItem({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="context-menu-item-submenu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="context-menu-item">
        {item.icon && <span className="context-menu-icon"><i className={item.icon} /></span>}
        <span className="context-menu-label">{item.label}</span>
        <i className="bi bi-chevron-right context-menu-arrow" />
      </span>
      {open && (
        <div className="context-menu context-submenu">
          {item.submenu!.map((sub, j) =>
            sub.separator ? (
              <div key={j} className="context-menu-separator" />
            ) : (
              <button
                key={sub.id}
                className={`context-menu-item ${sub.danger ? "danger" : ""} ${sub.disabled ? "disabled" : ""}`}
                onClick={() => { if (!sub.disabled) { sub.onClick?.(); onClose(); } }}
                disabled={sub.disabled}
              >
                {sub.icon && <span className="context-menu-icon"><i className={sub.icon} /></span>}
                <span className="context-menu-label">{sub.label}</span>
                {sub.shortcut && <span className="context-menu-shortcut">{sub.shortcut}</span>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (x - rect.width) + "px";
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (y - rect.height) + "px";
    }
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClick, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", handleClick, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <Portal>
    <div
      ref={menuRef}
      className="context-menu"
      style={{ position: "fixed", left: x, top: y }}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-menu-separator" />
        ) : item.hint ? (
          <div key={item.id} className="context-menu-hint">{item.label}</div>
        ) : item.submenu ? (
          <SubMenuItem key={item.id} item={item} onClose={onClose} />
        ) : (
          <button
            key={item.id}
            className={`context-menu-item ${item.danger ? "danger" : ""} ${item.disabled ? "disabled" : ""}`}
            onClick={() => {
              if (!item.disabled) {
                item.onClick?.();
                onClose();
              }
            }}
            disabled={item.disabled}
          >
            {item.icon && <span className="context-menu-icon"><i className={item.icon} /></span>}
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
    </Portal>
  );
}
