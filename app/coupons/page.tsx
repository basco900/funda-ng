import type { Metadata } from "next";
import Link from "next/link";
import BlogFooter from "@/components/blog/blog-footer";
import BlogNavHeader from "@/components/blog/blog-nav-header";
import { BrandLogo } from "@/components/coupons/brand-logo";
import CouponSearch from "@/components/coupons/coupon-search";
import OfferCard from "@/components/coupons/offer-card";
import { couponTotals, loadBrandIndex, loadCouponRails } from "@/lib/coupons/queries";
import { CATEGORY_LABELS } from "@/lib/coupons/types";
import styles from "./coupons.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Coupon Codes That Work | Funda",
  description: "Search promo codes, deals, free trials and student discounts for the brands Nigerians shop with, checked and rated by real shoppers.",
  alternates: { canonical: "/coupons" },
};

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const [rails, totals, brands] = await Promise.all([loadCouponRails(), couponTotals(), loadBrandIndex()]);
  const categories = [...new Set(brands.map((brand) => brand.category))].sort((a, b) => (CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b));
  const directory = brands.filter((brand) => (category ? brand.category === category : true)).sort((a, b) => b.offers - a.offers || a.name.localeCompare(b.name));

  return (
    <>
      <BlogNavHeader />
      <main className={styles.page}>
        <section className={styles.hero}>
          <h1>
            Coupon codes that <span>actually work</span>
          </h1>
          <CouponSearch autoFocus />
          {totals.brands ? (
            <p className={styles.totals}>
              <span>
                <strong>{totals.brands.toLocaleString("en-NG")}</strong> brands
              </span>
              <span>
                <strong>{totals.offers.toLocaleString("en-NG")}</strong> live offers
              </span>
              <span>
                <strong>{totals.codes.toLocaleString("en-NG")}</strong> codes
              </span>
            </p>
          ) : null}
        </section>

        <div className={styles.columns}>
          <div className={styles.stack}>
            {rails.hot.length ? (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2>Hot right now</h2>
                </div>
                <div className={styles.offers}>
                  {rails.hot.map((offer) => (
                    <OfferCard key={offer.id} offer={offer} brand={offer.brand} showBrand />
                  ))}
                </div>
              </section>
            ) : null}

            <section className={styles.section} id="brands">
              <div className={styles.sectionHead}>
                <h2>{category ? CATEGORY_LABELS[category] ?? category : "All brands"}</h2>
              </div>
              <div className={styles.chips}>
                <Link href="/coupons#brands" className={styles.chip} data-active={!category} scroll={false}>
                  All <small>{brands.length}</small>
                </Link>
                {categories.map((key) => (
                  <Link key={key} href={`/coupons?category=${key}#brands`} className={styles.chip} data-active={category === key} scroll={false}>
                    {CATEGORY_LABELS[key] ?? key} <small>{brands.filter((brand) => brand.category === key).length}</small>
                  </Link>
                ))}
              </div>
              <div className={styles.directory}>
                {directory.map((brand) => (
                  <Link key={brand.id} href={`/coupons/${brand.slug}`} className={styles.directoryItem}>
                    <BrandLogo domain={brand.domain} name={brand.name} />
                    <span>
                      <strong>{brand.name}</strong>
                      <small>{brand.offers ? brand.best ?? `${brand.offers} offers` : "No offers yet"}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <aside className={styles.stack}>
            {rails.popular.length ? (
              <section className={styles.panel}>
                <h2>Popular brands</h2>
                <div className={styles.brandGrid}>
                  {rails.popular.slice(0, 9).map((brand) => (
                    <Link key={brand.id} href={`/coupons/${brand.slug}`} className={styles.brandTile}>
                      <BrandLogo domain={brand.domain} name={brand.name} />
                      <span>{brand.name}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {rails.endingSoon.length ? (
              <section className={styles.panel}>
                <h2>Ending soon</h2>
                {rails.endingSoon.map((offer) => (
                  <div key={offer.id} className={styles.mini}>
                    <Link href={`/coupons/${offer.brand.slug}`}>
                      <BrandLogo domain={offer.brand.domain} name={offer.brand.name} />
                      <span>
                        <strong>{offer.discount_text || offer.title}</strong>
                        <small>{offer.brand.name}</small>
                      </span>
                    </Link>
                    <span className={styles.when}>{new Date(offer.expires_at!).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</span>
                  </div>
                ))}
              </section>
            ) : null}

            {rails.nigeria.length ? (
              <section className={styles.panel}>
                <h2>Shop Nigerian</h2>
                {rails.nigeria.slice(0, 6).map((brand) => (
                  <Link key={brand.id} href={`/coupons/${brand.slug}`} className={styles.brandRow}>
                    <BrandLogo domain={brand.domain} name={brand.name} />
                    <span>
                      <strong>{brand.name}</strong>
                      <small>{brand.best ?? `${brand.offers} offers`}</small>
                    </span>
                  </Link>
                ))}
              </section>
            ) : null}

            {rails.recent.length ? (
              <section className={styles.panel}>
                <h2>Just checked</h2>
                {rails.recent.slice(0, 6).map((offer) => (
                  <div key={offer.id} className={styles.mini}>
                    <Link href={`/coupons/${offer.brand.slug}`}>
                      <BrandLogo domain={offer.brand.domain} name={offer.brand.name} />
                      <span>
                        <strong>{offer.discount_text || offer.title}</strong>
                        <small>{offer.brand.name}</small>
                      </span>
                    </Link>
                  </div>
                ))}
              </section>
            ) : null}
          </aside>
        </div>
      </main>
      <BlogFooter />
    </>
  );
}
