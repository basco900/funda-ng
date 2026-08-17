"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { parseIdentifier } from "../../lib/auth/identifiers";
import { createClient } from "../../lib/supabase/client";
import { CheckIcon, CloseIcon } from "../onboarding/icons";
import {
  changeAccountPassword,
  signOut,
  updateAccountProfile,
  updateAccountSettings,
  type AccountActionResult,
} from "./actions";
import styles from "./dashboard.module.css";

type AccountTab = "profile" | "account" | "security" | "settings";

export type ProfileCenterUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  fullName: string;
  displayName?: string | null;
  initials: string;
  dateOfBirth?: string | null;
  countryCode: string;
  state?: string | null;
  city?: string | null;
  createdAt?: string | null;
  lastSignInAt?: string | null;
  emailConfirmed: boolean;
  phoneConfirmed: boolean;
};

export type ProfileCenterSettings = {
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  marketingNotifications: boolean;
  transactionAlerts: boolean;
  securityAlerts: boolean;
  preferredLanguage: "en";
  timezone: string;
};

type ProfileCenterProps = {
  user: ProfileCenterUser;
  settings: ProfileCenterSettings;
  onClose: () => void;
};

const tabs: Array<{ id: AccountTab; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "account", label: "Account" },
  { id: "security", label: "Security" },
  { id: "settings", label: "Settings" },
];

function StatusMessage({ result }: { result: AccountActionResult | null }) {
  if (!result) return null;
  return (
    <div className={result.ok ? styles.accountSuccess : styles.accountError} role="status">
      {result.message}
    </div>
  );
}

function formatIsoToDisplay(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d} / ${m} / ${y}`;
}

function BirthDateInput({ initialValue }: { initialValue?: string | null }) {
  const [displayValue, setDisplayValue] = useState(() => formatIsoToDisplay(initialValue));
  const [isoValue, setIsoValue] = useState(initialValue || "");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "").slice(0, 8);

    let formatted = "";
    if (digits.length <= 2) {
      formatted = digits;
    } else if (digits.length <= 4) {
      formatted = `${digits.slice(0, 2)} / ${digits.slice(2)}`;
    } else {
      formatted = `${digits.slice(0, 2)} / ${digits.slice(2, 4)} / ${digits.slice(4)}`;
    }
    setDisplayValue(formatted);

    if (digits.length === 8) {
      const d = digits.slice(0, 2);
      const m = digits.slice(2, 4);
      const y = digits.slice(4, 8);
      setIsoValue(`${y}-${m}-${d}`);
    } else if (digits.length === 0) {
      setIsoValue("");
    }
  };

  return (
    <>
      <input type="hidden" name="dateOfBirth" value={isoValue} />
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        placeholder="DD / MM / YYYY"
        inputMode="numeric"
        autoComplete="bday"
        maxLength={14}
      />
    </>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={styles.settingToggleRow}>
      <span className={styles.settingToggleText}>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <i aria-hidden="true" />
    </label>
  );
}

export default function ProfileCenter({ user, settings: initialSettings, onClose }: ProfileCenterProps) {
  const router = useRouter();
  const [tab, setTab] = useState<AccountTab>("profile");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneStep, setPhoneStep] = useState<"entry" | "verify">("entry");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [settings, setSettings] = useState(initialSettings);

  const run = (action: () => Promise<AccountActionResult>, refresh = false) => {
    setResult(null);
    startTransition(async () => {
      const next = await action();
      setResult(next);
      if (next.ok && refresh) router.refresh();
    });
  };

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run(
      () =>
        updateAccountProfile({
          fullName: data.get("fullName"),
          displayName: data.get("displayName"),
          dateOfBirth: data.get("dateOfBirth"),
          countryCode: data.get("countryCode"),
          state: data.get("state"),
          city: data.get("city"),
        }),
      true
    );
  };

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    run(async () => {
      const response = await changeAccountPassword({
        currentPassword: data.get("currentPassword"),
        password: data.get("password"),
        confirmPassword: data.get("confirmPassword"),
      });
      if (response.ok) form.reset();
      return response;
    });
  };

  const sendPhoneCode = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseIdentifier(phone);
    if (!parsed || parsed.type !== "phone") {
      setResult({ ok: false, message: "Enter a valid Nigerian phone number." });
      return;
    }
    setPhoneBusy(true);
    setResult(null);
    const { error } = await createClient().auth.updateUser({ phone: parsed.value });
    setPhoneBusy(false);
    if (error) {
      setResult({
        ok: false,
        message: error.message.includes("provider")
          ? "Enable the Supabase Phone provider before adding a number."
          : "We could not send the verification code.",
      });
      return;
    }
    setPhone(parsed.value);
    setPhoneStep("verify");
    setResult({ ok: true, message: "Verification code sent by SMS." });
  };

  const verifyPhone = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(phoneCode)) {
      setResult({ ok: false, message: "Enter the six-digit verification code." });
      return;
    }
    setPhoneBusy(true);
    setResult(null);
    const { error } = await createClient().auth.verifyOtp({ phone, token: phoneCode, type: "phone_change" });
    setPhoneBusy(false);
    if (error) {
      setResult({ ok: false, message: "That code is invalid or expired. Request a new one." });
      return;
    }
    setResult({ ok: true, message: "Phone number verified and added." });
    setPhoneStep("entry");
    setPhoneCode("");
    router.refresh();
  };

  const saveSettings = (event: FormEvent) => {
    event.preventDefault();
    run(() => updateAccountSettings(settings));
  };

  return (
    <div
      className={styles.profileCenter}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-center-title"
      onClick={(event) => event.stopPropagation()}
    >
      <div className={styles.profileCenterHandle} aria-hidden="true" />

      {/* Header */}
      <header className={styles.profileCenterHeader}>
        <div>
          <span className={styles.accountEyebrow}>ACCOUNT</span>
          <h2 id="profile-center-title">Profile & Settings</h2>
        </div>
        <button type="button" className={styles.sheetCloseBtn} onClick={onClose} aria-label="Close profile">
          <CloseIcon size={15} />
        </button>
      </header>

      {/* User Identity Card */}
      <div className={styles.profileCenterIdentity}>
        <div className={styles.drawerAvatarLarge}>{user.initials}</div>
        <div className={styles.identityDetails}>
          <strong>{user.displayName || user.fullName}</strong>
          <span>{user.email || user.phone || "Funda member"}</span>
        </div>
        <span className={styles.verifiedAccountPill}>
          <CheckIcon size={11} /> Verified
        </span>
      </div>

      {/* Segmented Tabs */}
      <nav className={styles.profileTabs} aria-label="Profile sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? styles.profileTabActive : ""}
            onClick={() => {
              setTab(item.id);
              setResult(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Scrollable Content */}
      <div className={styles.profileCenterScroll}>
        {tab === "profile" && (
          <form className={styles.accountForm} onSubmit={submitProfile}>
            <div className={styles.accountSectionHeading}>
              <h3>Personal Details</h3>
              <p>Keep the identity attached to your wallet accurate.</p>
            </div>
            <div className={styles.accountFieldGrid}>
              <label className={styles.accountFieldWide}>
                Full Legal Name
                <input name="fullName" defaultValue={user.fullName} autoComplete="name" required />
              </label>
              <label>
                Display Name
                <input
                  name="displayName"
                  defaultValue={user.displayName || ""}
                  placeholder="What should we call you?"
                />
              </label>
              <label>
                Date of Birth
                <BirthDateInput initialValue={user.dateOfBirth} />
              </label>
              <label>
                State
                <input name="state" defaultValue={user.state || ""} autoComplete="address-level1" placeholder="e.g. Lagos" />
              </label>
              <label>
                City
                <input name="city" defaultValue={user.city || ""} autoComplete="address-level2" placeholder="e.g. Ikeja" />
              </label>
              <input type="hidden" name="countryCode" value={user.countryCode || "NG"} />
            </div>
            <StatusMessage result={result} />
            <button className={styles.accountPrimaryButton} disabled={pending}>
              {pending ? "Saving…" : "Save Changes"}
            </button>
          </form>
        )}

        {tab === "account" && (
          <section className={styles.accountPanelSection}>
            <div className={styles.accountSectionHeading}>
              <h3>Account Details</h3>
              <p>Your verified login and membership records.</p>
            </div>
            <div className={styles.accountInfoList}>
              <div className={styles.infoCard}>
                <span>Email Address</span>
                <strong>{user.email || "Not added"}</strong>
                <small>{user.emailConfirmed ? "✓ Verified" : "Unverified"}</small>
              </div>
              <div className={styles.infoCard}>
                <span>Phone Number</span>
                <strong>{user.phone || "Not added"}</strong>
                <small>{user.phoneConfirmed ? "✓ Verified" : "Action required"}</small>
              </div>
              <div className={styles.infoCard}>
                <span>Member Since</span>
                <strong>
                  {user.createdAt
                    ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(user.createdAt))
                    : "—"}
                </strong>
                <small>Active</small>
              </div>
            </div>

            <form
              className={styles.phoneEnrollment}
              onSubmit={phoneStep === "entry" ? sendPhoneCode : verifyPhone}
            >
              <h4>{user.phone ? "Change Phone Number" : "Add Phone Number"}</h4>
              {phoneStep === "entry" ? (
                <label>
                  Phone Number
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="0801 234 5678"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </label>
              ) : (
                <label>
                  Six-digit SMS Code
                  <input
                    value={phoneCode}
                    onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </label>
              )}
              <StatusMessage result={result} />
              <div className={styles.accountButtonRow}>
                {phoneStep === "verify" && (
                  <button
                    type="button"
                    className={styles.accountSecondaryButton}
                    onClick={() => setPhoneStep("entry")}
                  >
                    Back
                  </button>
                )}
                <button className={styles.accountPrimaryButton} disabled={phoneBusy}>
                  {phoneBusy ? "Sending…" : phoneStep === "entry" ? "Send SMS Code" : "Verify Phone"}
                </button>
              </div>
            </form>
          </section>
        )}

        {tab === "security" && (
          <section className={styles.accountPanelSection}>
            <div className={styles.accountSectionHeading}>
              <h3>Security & Password</h3>
              <p>Keep your account and wallet credentials safe.</p>
            </div>
            <div className={styles.securitySummary}>
              <div>
                <strong>Last Sign-In</strong>
                <span>
                  {user.lastSignInAt
                    ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(
                        new Date(user.lastSignInAt)
                      )
                    : "Current session"}
                </span>
              </div>
              <div>
                <strong>Security Alerts</strong>
                <span className={styles.securityActiveText}>Active & Monitoring</span>
              </div>
            </div>

            <form className={styles.accountForm} onSubmit={submitPassword}>
              <h4>Change Password</h4>
              <p className={styles.passwordHint}>At least 8 characters with letters and numbers.</p>
              <div className={styles.accountFieldGrid}>
                <label className={styles.accountFieldWide}>
                  Current Password
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label>
                  New Password
                  <input name="password" type="password" autoComplete="new-password" required />
                </label>
                <label>
                  Confirm Password
                  <input name="confirmPassword" type="password" autoComplete="new-password" required />
                </label>
              </div>
              <StatusMessage result={result} />
              <button className={styles.accountPrimaryButton} disabled={pending}>
                {pending ? "Updating…" : "Update Password"}
              </button>
            </form>

            <div className={styles.accountResourceLinks}>
              <Link href="/policies">Privacy & Security Policy</Link>
              <Link href="/faq">Help & FAQ</Link>
            </div>
          </section>
        )}

        {tab === "settings" && (
          <form className={styles.accountForm} onSubmit={saveSettings}>
            <div className={styles.accountSectionHeading}>
              <h3>Notifications & Preferences</h3>
              <p>Customize what notifications Funda sends you.</p>
            </div>
            <div className={styles.settingToggleList}>
              <ToggleRow
                title="Transaction Alerts"
                description="Instant wallet funding, recharge, and token delivery receipts."
                checked={settings.transactionAlerts}
                onChange={(value) => setSettings({ ...settings, transactionAlerts: value })}
              />
              <ToggleRow
                title="Security Alerts"
                description="New sign-ins and critical account notifications (required)."
                checked
                onChange={() => undefined}
                disabled
              />
              <ToggleRow
                title="Email Notifications"
                description="Account and service updates by email."
                checked={settings.emailNotifications}
                onChange={(value) => setSettings({ ...settings, emailNotifications: value })}
              />
              <ToggleRow
                title="SMS Notifications"
                description="Important transaction notices sent to your verified phone."
                checked={settings.smsNotifications}
                onChange={(value) => setSettings({ ...settings, smsNotifications: value })}
              />
              <ToggleRow
                title="Push Notifications"
                description="Instant notifications on supported browsers and devices."
                checked={settings.pushNotifications}
                onChange={(value) => setSettings({ ...settings, pushNotifications: value })}
              />
              <ToggleRow
                title="Offers & Cashback"
                description="Occasional discounts and cashback updates."
                checked={settings.marketingNotifications}
                onChange={(value) => setSettings({ ...settings, marketingNotifications: value })}
              />
            </div>
            <div className={styles.accountFieldGrid}>
              <label>
                Language
                <select
                  value={settings.preferredLanguage}
                  onChange={(event) =>
                    setSettings({ ...settings, preferredLanguage: event.target.value as "en" })
                  }
                >
                  <option value="en">English (UK)</option>
                </select>
              </label>
              <label>
                Timezone
                <select
                  value={settings.timezone}
                  onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}
                >
                  <option value="Africa/Lagos">West Africa Time (WAT)</option>
                  <option value="UTC">UTC</option>
                </select>
              </label>
            </div>
            <StatusMessage result={result} />
            <button className={styles.accountPrimaryButton} disabled={pending}>
              {pending ? "Saving…" : "Save Preferences"}
            </button>
          </form>
        )}

        {/* Muted Sign Out Footer */}
        <form action={signOut} className={styles.profileCenterSignOut}>
          <button type="submit">Sign out of Funda</button>
        </form>
      </div>
    </div>
  );
}
