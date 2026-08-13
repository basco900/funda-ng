export type IdentifierType = "email" | "phone";

export function parseIdentifier(raw: string): { type: IdentifierType; value: string } | null {
  const value = raw.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return { type: "email", value };

  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `234${digits.slice(1)}`;
  if (/^234[789]\d{9}$/.test(digits)) return { type: "phone", value: `+${digits}` };
  return null;
}

export function validFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 && value.trim().length >= 4 && value.trim().length <= 100;
}

export function validPassword(value: string) {
  return value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

