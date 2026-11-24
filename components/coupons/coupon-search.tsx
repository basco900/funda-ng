"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "../../app/coupons/coupons.module.css";
import { faviconUrl } from "./brand-logo";
import { CouponIcon } from "./icon";

type Suggestion = { slug: string; name: string; domain: string; offers: number; codes: number; best: string | null };

/** Brand search with typeahead; the optional item narrows what the brand page highlights. */
export default function CouponSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [brand, setBrand] = useState("");
  const [item, setItem] = useState("");
  const [results, setResults] = useState<Suggestion[] | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState("");
  const boxRef = useRef<HTMLFormElement>(null);

  // Short input shows nothing; results only ever come from the debounced fetch below.
  const visibleResults = brand.trim().length >= 2 ? results : null;

  useEffect(() => {
    const query = brand.trim();
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/coupons/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const body = (await response.json()) as { brands?: Suggestion[] };
        setResults(body.brands ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [brand]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (slug: string) => {
    setOpen(false);
    router.push(item.trim() ? `/coupons/${slug}?item=${encodeURIComponent(item.trim())}` : `/coupons/${slug}`);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const pick = visibleResults?.[active];
    if (pick) return go(pick.slug);
    if (brand.trim().length >= 3) {
      await fetch(`/api/coupons/search?final=1&q=${encodeURIComponent(brand.trim())}`).catch(() => null);
      setRequested(brand.trim());
      setOpen(true);
    }
  };

  return (
    <form ref={boxRef} className={styles.searchBox} onSubmit={submit} role="search">
      <label className={styles.field}>
        <CouponIcon name="search" />
        <input
          value={brand}
          onChange={(event) => setBrand(event.target.value)}
          onFocus={() => visibleResults && setOpen(true)}
          onKeyDown={(event) => {
            if (!visibleResults?.length) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => (index + 1) % visibleResults.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => (index - 1 + visibleResults.length) % visibleResults.length);
            } else if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Brand or website"
          aria-label="Brand or website"
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open}
          aria-controls="coupon-suggestions"
        />
      </label>
      <label className={styles.field}>
        <CouponIcon name="bag" />
        <input value={item} onChange={(event) => setItem(event.target.value)} placeholder="What are you buying?" aria-label="What are you buying (optional)" autoComplete="off" />
      </label>
      <button type="submit" className={styles.searchButton}>
        Find codes
      </button>

      {open && visibleResults ? (
        <div id="coupon-suggestions" role="listbox" className={styles.suggestions}>
          {visibleResults.length ? (
            visibleResults.map((result, index) => (
              <button key={result.slug} type="button" role="option" aria-selected={index === active} data-active={index === active} className={styles.suggestion} onMouseEnter={() => setActive(index)} onClick={() => go(result.slug)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- remote favicon */}
                <img src={faviconUrl(result.domain)} alt="" width={20} height={20} style={{ borderRadius: 5 }} />
                <span>
                  <strong>{result.name}</strong>
                  <small>{result.domain}</small>
                </span>
                <span>{result.offers ? `${result.offers} ${result.offers === 1 ? "offer" : "offers"}` : "Check now"}</span>
              </button>
            ))
          ) : (
            <p className={styles.noMatch}>
              {requested === brand.trim() ? <>Noted. We&apos;ll start tracking “{brand.trim()}” soon.</> : <>We don&apos;t track “{brand.trim()}” yet. Press Find codes and we&apos;ll add it.</>}
            </p>
          )}
        </div>
      ) : null}
    </form>
  );
}
