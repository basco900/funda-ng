"use client";

import { useActionState } from "react";
import { loginAdmin, type AdminLoginState } from "./actions";
import styles from "../admin.module.css";

const initialState: AdminLoginState = {};

export default function AdminLoginForm() {
  const [state, action, pending] = useActionState(loginAdmin, initialState);

  return (
    <form action={action} className={styles.loginForm}>
      <label className={styles.fieldGroup}>
        <span>Email address</span>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="admin@funda.ng"
          required
        />
      </label>

      <label className={styles.fieldGroup}>
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your admin password"
          minLength={6}
          required
        />
      </label>

      {state.error ? <p className={styles.loginError} role="alert">{state.error}</p> : null}

      <button className={styles.loginSubmit} type="submit" disabled={pending}>
        <span>{pending ? "Checking access…" : "Enter control centre"}</span>
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
