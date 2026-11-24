"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "../../app/coupons/coupons.module.css";
import { BADGE_LABELS, successRate, trustBadge } from "../../lib/coupons/trust";
import { KIND_LABELS, type CouponOffer } from "../../lib/coupons/types";
import { faviconUrl } from "./brand-logo";
import { CouponIcon } from "./icon";

type Brand = { slug: string; name: string; domain: string };

function endsLabel(expires: string | null) {
  if (!expires) return null;
  const days = Math.ceil((Date.parse(expires) - Date.now()) / 86_400_000);
  if (days < 0) return null;
  if (days <= 1) return "Ends today";
  if (days <= 7) return `Ends in ${days} days`;
  return `Ends ${new Date(expires).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`;
}

/** One offer: what you get, how far to trust it, and the code to copy. */
export default function OfferCard({ offer, brand, showBrand = false }: { offer: CouponOffer; brand: Brand; showBrand?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<boolean | null>(null);
  const [counts, setCounts] = useState({ worked: offer.worked_count, failed: offer.failed_count });
  const badge = trustBadge({ ...offer, worked_count: counts.worked, failed_count: counts.failed });
  const rate = successRate({ worked_count: counts.worked, failed_count: counts.failed });
  const ends = endsLabel(offer.expires_at);
  const storeUrl = offer.kind !== "code" && offer.source_url && offer.source_type === "brand" ? offer.source_url : `https://${brand.domain}`;

  const copy = async () => {
    if (!offer.code) return;
    try {
      await navigator.clipboard.writeText(offer.code);
    } catch {
      /* the code stays visible to copy by hand */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const reveal = async () => {
    setRevealed(true);
    await copy();
    fetch(`/api/coupons/offers/${offer.id}/copy`, { method: "POST" }).catch(() => null);
  };

  const sendVote = async (worked: boolean) => {
    setVote(worked);
    const response = await fetch(`/api/coupons/offers/${offer.id}/vote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ worked }) }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { worked?: number; failed?: number } | null;
    if (body && typeof body.worked === "number") setCounts({ worked: body.worked, failed: body.failed ?? 0 });
  };

  return (
    <article className={styles.offer} data-stale={offer.status === "stale"}>
      <div className={styles.discount}>
        <span>
          {offer.discount_text || KIND_LABELS[offer.kind]}
          <small>{KIND_LABELS[offer.kind]}</small>
        </span>
      </div>

      <div className={styles.offerBody}>
        {showBrand ? (
          <Link href={`/coupons/${brand.slug}`} className={styles.offerBrand}>
            {/* eslint-disable-next-line @next/next/no-img-element -- remote favicon */}
            <img src={faviconUrl(brand.domain)} alt="" />
            {brand.name}
          </Link>
        ) : null}
        <h3>{offer.title}</h3>
        {offer.conditions ? <p>{offer.conditions}</p> : null}
        <div className={styles.meta}>
          <span className={styles.tag} data-tone={badge === "verified" ? "verified" : badge === "brand" ? "brand" : undefined}>{BADGE_LABELS[badge]}</span>
          {rate !== null ? <span className={styles.tag} data-tone={rate >= 60 ? "verified" : "warn"}>Worked for {rate}%</span> : null}
          {offer.new_users_only ? <span className={styles.tag}>New customers</span> : null}
          {offer.min_spend ? <span className={styles.tag}>Min {offer.min_spend}</span> : null}
          {ends ? <span className={styles.tag} data-tone="warn">{ends}</span> : null}
          {offer.works_in_nigeria ? <span className={styles.tag}>Works in Nigeria</span> : null}
          {offer.status === "stale" ? <span className={styles.tag} data-tone="warn">Not seen lately</span> : null}
        </div>
      </div>

      <div className={styles.actions}>
        {offer.kind === "code" && offer.code ? (
          revealed ? (
            <div className={styles.codeBox}>
              <code>{offer.code}</code>
              <button type="button" className={styles.copyButton} onClick={copy}>
                <CouponIcon name={copied ? "check" : "copy"} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <button type="button" className={styles.reveal} onClick={reveal}>
              <CouponIcon name="tag" />
              Show code
            </button>
          )
        ) : (
          <a href={storeUrl} target="_blank" rel="noopener noreferrer nofollow" className={styles.reveal} onClick={() => setRevealed(true)}>
            Get deal
            <CouponIcon name="external" />
          </a>
        )}

        {revealed ? (
          <div className={styles.vote}>
            <span>Did it work?</span>
            <button type="button" data-picked={vote === true} onClick={() => sendVote(true)} aria-label="It worked">
              <CouponIcon name="up" />
              Yes
            </button>
            <button type="button" data-picked={vote === false} onClick={() => sendVote(false)} aria-label="It didn't work">
              <CouponIcon name="down" />
              No
            </button>
          </div>
        ) : (
          <a href={`https://${brand.domain}`} target="_blank" rel="noopener noreferrer nofollow" className={styles.storeLink}>
            {brand.domain}
            <CouponIcon name="external" />
          </a>
        )}
      </div>

      {copied ? (
        <div className={styles.toast} role="status">
          <CouponIcon name="check" />
          Code copied
        </div>
      ) : null}
    </article>
  );
}
