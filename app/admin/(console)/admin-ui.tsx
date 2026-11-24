"use client";

import { useEffect, type ReactNode } from "react";
import AdminIcon from "./admin-icon";
import styles from "../admin.module.css";

/* Shared admin building blocks: dialog, confirm dialog, feedback banner, switch and tooltip. */

export function AdminModal({
  title,
  eyebrow,
  onClose,
  children,
  footer,
  width = 520,
  flush = false,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  flush?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: width }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.modalHeader}>
          <div>
            {eyebrow ? <span className={styles.pageEyebrow}>{eyebrow}</span> : null}
            <h2>{title}</h2>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            <AdminIcon name="close" />
          </button>
        </header>
        <div className={flush ? styles.modalBodyFlush : styles.modalBody}>{children}</div>
        {footer ? <footer className={styles.modalFooter}>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function AdminConfirm({
  title,
  body,
  confirmLabel,
  tone = "danger",
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AdminModal
      title={title}
      onClose={onCancel}
      width={400}
      footer={
        <>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={tone === "danger" ? styles.dangerButton : styles.primaryButton}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className={styles.modalText}>{body}</p>
    </AdminModal>
  );
}

export function AdminFeedback({
  tone,
  text,
  onClose,
}: {
  tone: "success" | "error";
  text: string;
  onClose: () => void;
}) {
  return (
    <div className={styles.feedbackBanner} data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      <AdminIcon name={tone === "success" ? "check" : "alert"} />
      <span>{text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss">
        <AdminIcon name="close" />
      </button>
    </div>
  );
}

export function AdminSwitch({
  name,
  label,
  defaultChecked,
  checked,
  onChange,
  value = "true",
}: {
  name?: string;
  label: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  value?: string;
}) {
  return (
    <label className={styles.switchField}>
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
      />
      <span className={styles.switchTrack} aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function AdminTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className={styles.tipAnchor}>
      {children}
      <span role="tooltip" className={styles.tip}>{label}</span>
    </span>
  );
}
