"use client";

import { useActionState, useState } from "react";
import { loginAdmin, type AdminLoginState } from "./actions";
import AdminIcon from "../(console)/admin-icon";
import styles from "../admin.module.css";

const initialState: AdminLoginState = {};

export default function AdminLoginForm() {
  const [state, action, pending] = useActionState(loginAdmin, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className={styles.loginForm} aria-label="Admin login">
      <div className={styles.loginFieldRow}>
        <label htmlFor="admin-email">Work email</label>
        <div className={styles.loginControl}>
          <span className={styles.loginIconTile} aria-hidden="true"><AdminIcon name="mail" /></span>
          <input
            id="admin-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="you@funda.ng"
            maxLength={320}
            required
          />
        </div>
      </div>

      <div className={styles.loginFieldRow}>
        <label htmlFor="admin-password">Password</label>
        <div className={styles.loginControl}>
          <span className={styles.loginIconTile} aria-hidden="true"><AdminIcon name="lock" /></span>
          <input
            id="admin-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            minLength={6}
            maxLength={128}
            required
          />
          <button
            className={styles.passwordToggle}
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            <AdminIcon name={showPassword ? "eyeOff" : "eye"} />
          </button>
        </div>
      </div>

      {state.error ? <p className={styles.loginError} role="alert">{state.error}</p> : null}

      <button className={styles.loginSubmit} type="submit" disabled={pending}>
        {pending ? (
          <>
            <span className={styles.loginSpinner} aria-hidden="true" />
            Logging in...
          </>
        ) : (
          <>
            Login
            <span className={styles.submitIcon} aria-hidden="true"><AdminIcon name="arrowUpRight" /></span>
          </>
        )}
      </button>
      <p className={styles.authNote}>Admin accounts are created by a Super Admin.</p>
    </form>
  );
}
