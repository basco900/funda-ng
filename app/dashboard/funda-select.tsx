"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import styles from "./dashboard.module.css";

export type FundaSelectOption = {
  value: string;
  label: string;
  meta?: string;
};

/* Custom dropdown for the customer app — replaces native <select> everywhere. */
export default function FundaSelect({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select",
  ariaLabel,
}: {
  value: string;
  options: FundaSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const openMenu = () => {
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };

  const choose = (option: FundaSelectOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openMenu();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + step + options.length) % options.length);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option);
    }
  };

  return (
    <div ref={rootRef} className={styles.fundaSelect} data-open={open || undefined} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={styles.fundaSelectTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span className={styles.fundaSelectValue} data-placeholder={!selected || undefined}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.meta ? <span className={styles.fundaSelectMeta}>{selected.meta}</span> : null}
        <svg className={styles.fundaSelectChevron} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div id={listId} role="listbox" className={styles.fundaSelectMenu}>
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={styles.fundaSelectOption}
              data-active={index === activeIndex || undefined}
              data-selected={option.value === value || undefined}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.meta ? <small>{option.meta}</small> : null}
            </button>
          ))}
          {!options.length ? <p className={styles.fundaSelectEmpty}>No options</p> : null}
        </div>
      ) : null}
    </div>
  );
}
