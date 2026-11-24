import styles from "../../app/coupons/coupons.module.css";

/** A brand's favicon in a soft tile. Icons come from Google's favicon service. */
export function BrandLogo({ domain, name, size = "md" }: { domain: string; name: string; size?: "md" | "lg" }) {
  const pixels = size === "lg" ? 128 : 64;
  return (
    <span className={size === "lg" ? `${styles.logo} ${styles.logoLarge}` : styles.logo}>
      {/* eslint-disable-next-line @next/next/no-img-element -- remote favicons, sized by the tile */}
      <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${pixels}`} alt={`${name} logo`} loading="lazy" decoding="async" />
    </span>
  );
}

export function faviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}
