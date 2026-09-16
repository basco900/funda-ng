"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import AdminIcon from "./admin-icon";
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
  onValueChange,
}: AdminSelectProps) {
  const generatedId = useId();
  const triggerId = id ?? `admin-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
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
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

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

  function choose(option: AdminSelectOption) {
    if (option.disabled) return;
    if (value === undefined) setInternalValue(option.value);
    onValueChange?.(option.value);
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
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
    if (!open) {
      const selectedIndex = filteredOptions.findIndex((option) => option.value === currentValue);
      setActiveIndex(Math.max(0, selectedIndex));
    }
    setOpen((wasOpen) => !wasOpen);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      else moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open && !searchable) {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (option) choose(option);
    }
  }

  return (
    <div ref={rootRef} className={styles.adminSelect} data-open={open || undefined}>
      {name ? <input type="hidden" name={name} value={currentValue} /> : null}
      <button
        id={triggerId}
        type="button"
        className={styles.adminSelectTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={toggleMenu}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.adminSelectValue} data-placeholder={!selected || undefined}>
          <strong>{selected?.label ?? placeholder}</strong>
          {selected?.description ? <small>({selected.description})</small> : null}
        </span>
        <AdminIcon name="chevronDown" className={styles.adminSelectChevron} />
      </button>

      {open ? (
        <div id={listboxId} role="listbox" className={styles.adminSelectMenu} aria-labelledby={triggerId}>
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
      ) : null}
    </div>
  );
}
