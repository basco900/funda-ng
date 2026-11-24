"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import AdminIcon, { type AdminIconName } from "./admin-icon";
import { cn } from "../../../lib/utils";
import styles from "../admin.module.css";

export type AdminSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type AdminSelectProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  options: AdminSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  leadingIcon?: AdminIconName;
  variant?: "default" | "compact";
  menuAlign?: "left" | "right";
  ariaLabel?: string;
  className?: string;
  onValueChange?: (value: string) => void;
};

function parseSearchTokens(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const regex = /["'“‘]([^"'“”‘’]+)["'”’]|([^\s"'“”‘’]+)/g;
  const tokens: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    const token = (match[1] || match[2] || "").trim();
    if (token) tokens.push(token);
  }

  if (tokens.length === 0) {
    const cleaned = normalized.replace(/["'“”‘’]/g, " ").trim();
    return cleaned.split(/\s+/).filter(Boolean);
  }

  return tokens;
}

export default function AdminSelect({
  id,
  name,
  value,
  defaultValue = "",
  options,
  placeholder = "Select an option",
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search options",
  leadingIcon,
  variant = "default",
  menuAlign = "left",
  ariaLabel,
  className,
  onValueChange,
}: AdminSelectProps) {
  const generatedId = useId();
  const triggerId = id ?? `admin-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const currentValue = value === undefined ? internalValue : value;

  const filteredOptions = useMemo(() => {
    const terms = parseSearchTokens(query);
    if (!terms.length) return options;
    return options.filter((option) => {
      const searchIndex = `${option.label} ${option.description ?? ""}`.toLowerCase();
      return terms.every((term) => searchIndex.includes(term));
    });
  }, [options, query]);

  const selected = options.find((option) => option.value === currentValue);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;

    const positionMenu = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const rect = trigger.getBoundingClientRect();
      const pad = 12;
      const gap = 6;
      const width = Math.min(Math.max(rect.width, 220), Math.max(rect.width, 320), window.innerWidth - pad * 2);
      const spaceBelow = window.innerHeight - rect.bottom - pad - gap;
      const spaceAbove = rect.top - pad - gap;
      const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(150, Math.min(340, openUpward ? spaceAbove : spaceBelow));

      let left = menuAlign === "right" ? rect.right - width : rect.left;
      left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));

      menu.style.position = "fixed";
      menu.style.left = `${left}px`;
      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${maxHeight}px`;
      menu.style.zIndex = "100025";

      if (openUpward) {
        menu.style.top = "auto";
        menu.style.bottom = `${window.innerHeight - rect.top + gap}px`;
        menu.style.transformOrigin = menuAlign === "right" ? "bottom right" : "bottom left";
      } else {
        menu.style.bottom = "auto";
        menu.style.top = `${rect.bottom + gap}px`;
        menu.style.transformOrigin = menuAlign === "right" ? "top right" : "top left";
      }
    };

    positionMenu();
    const handleScroll = (event: Event) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) {
        return;
      }
      positionMenu();
    };
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", positionMenu);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", positionMenu);
    };
  }, [open, menuAlign, filteredOptions.length]);

  useEffect(() => {
    if (open && searchable) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, searchable]);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form || value !== undefined) return;
    const reset = () => {
      setInternalValue(defaultValue);
      setOpen(false);
      setQuery("");
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue, value]);

  function openMenu() {
    const host = (rootRef.current?.closest("[data-admin-shell]") as HTMLElement | null) ?? document.body;
    setPortalHost(host);
    const selectedIndex = filteredOptions.findIndex((option) => option.value === currentValue);
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  }

  function choose(option: AdminSelectOption) {
    if (option.disabled) return;
    if (value === undefined) setInternalValue(option.value);
    onValueChange?.(option.value);
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function moveActive(direction: 1 | -1) {
    if (!filteredOptions.length) return;
    let next = activeIndex;
    do {
      next = (next + direction + filteredOptions.length) % filteredOptions.length;
    } while (filteredOptions[next]?.disabled && next !== activeIndex);
    setActiveIndex(next);
  }

  function toggleMenu() {
    if (!open) openMenu();
    else setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openMenu();
      else moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open && !searchable) {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option) choose(option);
    }
  }

  const menuElement = open ? (
    <div
      ref={menuRef}
      id={listboxId}
      role="listbox"
      className={styles.adminSelectMenu}
      aria-labelledby={triggerId}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {searchable ? (
        <div className={styles.adminSelectSearch}>
          <AdminIcon name="search" />
          <input
            ref={searchRef}
            className={styles.adminSelectSearchInput}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                moveActive(event.key === "ArrowDown" ? 1 : -1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                const option = filteredOptions[activeIndex];
                if (option) choose(option);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={searchPlaceholder}
          />
        </div>
      ) : null}

      <div className={styles.adminSelectOptions}>
        {filteredOptions.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === currentValue}
            className={styles.adminSelectOption}
            data-active={index === activeIndex || undefined}
            data-selected={option.value === currentValue || undefined}
            disabled={option.disabled}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(option)}
          >
            <span className={styles.adminSelectOptionBody}>
              <strong>{option.label}</strong>
              {option.description ? <small>{option.description}</small> : null}
            </span>
            {option.value === currentValue ? <AdminIcon name="check" /> : null}
          </button>
        ))}
        {!filteredOptions.length ? <p className={styles.adminSelectEmpty}>No matching options</p> : null}
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={cn(styles.adminSelect, className)}
      data-open={open || undefined}
      data-variant={variant}
    >
      {name ? <input type="hidden" name={name} value={currentValue} /> : null}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={styles.adminSelectTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggleMenu}
        onKeyDown={handleKeyDown}
      >
        {leadingIcon ? <AdminIcon name={leadingIcon} className={styles.adminSelectLeading} /> : null}
        <span className={styles.adminSelectValue} data-placeholder={!selected || undefined}>
          <strong>{selected?.label ?? placeholder}</strong>
          {variant !== "compact" && selected?.description ? <small>({selected.description})</small> : null}
        </span>
        <AdminIcon name="chevronDown" className={styles.adminSelectChevron} />
      </button>

      {menuElement && portalHost ? createPortal(menuElement, portalHost) : menuElement}
    </div>
  );
}
