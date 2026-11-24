import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BlogFooter from "@/components/blog/blog-footer";
import BlogNavHeader from "@/components/blog/blog-nav-header";
import { BrandLogo } from "@/components/coupons/brand-logo";
import { CouponIcon } from "@/components/coupons/icon";
import LiveRefresh from "@/components/coupons/live-refresh";
import OfferCard from "@/components/coupons/offer-card";
import ShareCode from "@/components/coupons/share-code";
import { couponProvidersReady } from "@/lib/coupons/providers";
import { getBrandBySlug } from "@/lib/coupons/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORY_LABELS } from "@/lib/coupons/types";
import styles from "../coupons.module.css";

export const dynamic = "force-dynamic";

const monthYear = () => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date());

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await getBrandBySlug((await params).slug);
  if (!data) return { title: "Coupons | Funda" };
  const codes = data.offers.filter((offer) => offer.kind === "code" && offer.status === "active").length;
  return {
    title: `${data.brand.name} Promo Codes & Coupons (${monthYear()}) | Funda`,
    description: `${codes ? `${codes} working ${codes === 1 ? "code" : "codes"}` : "Deals and offers"} for ${data.brand.name}, checked and rated by shoppers.`,
    alternates: { canonical: `/coupons/${data.brand.slug}` },
  };
}

function checkedLabel(value: string | null) {
  if (!value) return "Not checked yet";
  const hours = Math.round((Date.now() - Date.parse(value)) / 3_600_000);
  if (hours < 1) return "Checked just now";
  if (hours < 24) return `Checked ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Checked ${days} ${days === 1 ? "day" : "days"} ago`;
}

export default async function BrandCouponsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ item?: string }> }) {
  const [{ slug }, { item }] = await Promise.all([params, searchParams]);
  const data = await getBrandBySlug(slug);
  if (!data) notFound();
  const { brand } = data;
  await createAdminClient().rpc("bump_coupon_brand_search", { p_brand_id: brand.id });

  const term = item?.trim().toLowerCase();
  const matches = (offer: (typeof data.offers)[number]) => Boolean(term && `${offer.title} ${offer.conditions ?? ""}`.toLowerCase().includes(term));
  const active = data.offers.filter((offer) => offer.status === "active").sort((a, b) => Number(matches(b)) - Number(matches(a)));
  const stale = data.offers.filter((offer) => offer.status === "stale");
  const codes = active.filter((offer) => offer.kind === "code");
  const others = active.filter((offer) => offer.kind !== "code");
  const brandLink = { slug: brand.slug, name: brand.name, domain: brand.domain };

  return (
    <>
      <BlogNavHeader />
      <main className={styles.page}>
        <Link href="/coupons" className={styles.back}>
          <CouponIcon name="back" />
          All coupons
        </Link>

        <header className={styles.brandHead}>
          <BrandLogo domain={brand.domain} name={brand.name} size="lg" />
          <div>
            <h1>{brand.name} coupons</h1>
            <p>
              <a href={`https://${brand.domain}`} target="_blank" rel="noopener noreferrer nofollow">
                {brand.domain}
              </a>
              <span>{CATEGORY_LABELS[brand.category] ?? brand.category}</span>
              <span>{checkedLabel(brand.last_refreshed_at)}</span>
            </p>
          </div>
          <div>
            <ShareCode brand={brand.slug} brandName={brand.name} />
          </div>
        </header>

        <div className={styles.stack}>
          {codes.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2>Promo codes</h2>
              </div>
              <div className={styles.offers}>
                {codes.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} brand={brandLink} />
                ))}
              </div>
            </section>
          ) : null}

          {others.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2>{codes.length ? "More ways to save" : "Ways to save"}</h2>
              </div>
              <div className={styles.offers}>
                {others.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} brand={brandLink} />
                ))}
              </div>
            </section>
          ) : null}

          {!active.length ? (
            <div className={styles.empty}>
              <strong>No working codes right now</strong>
              {couponProvidersReady() ? <LiveRefresh slug={brand.slug} /> : null}
            </div>
          ) : null}

          {stale.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2>Might not work anymore</h2>
              </div>
              <div className={styles.offers}>
                {stale.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} brand={brandLink} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <BlogFooter />
    </>
  );
}
