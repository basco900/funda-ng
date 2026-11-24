// TEMPORARY dev-only sample data for /admin-preview. Delete with the preview route.
const iso = (minutesAgo: number) => new Date(Date.UTC(2026, 10, 22, 14, 0) - minutesAgo * 60_000).toISOString();

export const providers = [
  { id: "p1", name: "MaskawaSub", slug: "maskawasub", status: "active" },
  { id: "p2", name: "VTPass", slug: "vtpass", status: "active" },
  { id: "p3", name: "SMEPlug", slug: "smeplug", status: "standby" },
];

const tx = (service: string, metadata: Record<string, string> = {}) =>
  ["successful", "failed", "pending", "successful", "refunded", "successful"].map((status, i) => ({
    id: `${service}-${i}`,
    internal_reference: `FND-202611${22 - i}-${service.slice(0, 2).toUpperCase()}${i}9A`,
    provider_reference: i % 2 ? null : `PRV-${88123 + i}`,
    destination: ["08163474155", "07025468818", "1023456789", "45069821003", "08031234567", "09062221144"][i],
    amount: [500, 1200, 8400, 15700, 2500, 3200][i],
    status,
    service_type: service,
    metadata: { customerName: ["Amina Bello", "Chinedu Okafor", "Tunde Bakare", "Zainab Yusuf", "Ifeoma Nwosu", "Musa Danjuma"][i], ...metadata },
    created_at: iso(i * 95),
    user: { id: `u${i}`, phone: "08163474155" },
  }));

export const purchaseFilter = { status: "", total: 6, options: [{ value: "successful", label: "Successful", count: 3 }, { value: "failed", label: "Failed", count: 1 }, { value: "pending", label: "Pending", count: 1 }, { value: "refunded", label: "Refunded", count: 1 }] };

export const tvConfigs = [
  ["dstv", "DStv (MultiChoice)"], ["gotv", "GOtv (MultiChoice)"], ["showmax", "Showmax Streaming"], ["startimes", "StarTimes"],
].map(([code, name], i) => ({ operator_code: code, operator_name: name, primary_provider: "vtpass", fallback_provider: i === 2 ? null : "maskawasub", convenience_fee: i * 50, cashback_percentage: 1, is_active: i !== 3, maintenance_notice: i === 3 ? "Upstream maintenance until 6pm" : null, updated_at: iso(60) }));

export const tvPackages = Array.from({ length: 9 }, (_, i) => ({ id: `pk${i}`, operator_code: ["dstv", "gotv", "startimes"][i % 3], package_code: `pkg-${i}`, name: ["DStv Compact", "GOtv Max", "Nova Weekly", "DStv Premium", "GOtv Jolli", "Basic Monthly", "DStv Padi", "GOtv Smallie", "Classic"][i], price: [19000, 8500, 600, 44500, 5800, 3200, 4400, 1900, 5000][i], duration_months: i === 2 ? 0 : 1, is_active: i !== 4, sort_order: i, created_at: iso(500) }));
export const tvTransactions = tx("tv", { packageName: "DStv Compact" });

export const discos = [
  ["ikedc", "Ikeja Electric", "Lagos North"], ["ekedc", "Eko Electric", "Lagos South"], ["aedc", "Abuja Electric", "FCT, Niger, Kogi"], ["kedco", "Kano Electric", "Kano, Jigawa, Katsina"], ["phed", "Port Harcourt Electric", "Rivers, Bayelsa"],
].map(([code, name, area], i) => ({ disco_code: code, disco_name: name, coverage_area: area, primary_provider: "vtpass", fallback_provider: i % 2 ? "maskawasub" : null, supports_prepaid: true, supports_postpaid: i !== 3, convenience_fee: 100, cashback_percentage: 0.5, min_purchase_amount: 1000, max_purchase_amount: 500000, is_active: i !== 4, maintenance_notice: null }));
export const electricityTransactions = tx("electricity", { token: "4821-0091-2283-1180-7734", units: "42.5" });

export const educationConfigs = [["waec", "West African Examinations Council", "WAEC"], ["neco", "National Examinations Council", "NECO"], ["jamb", "Joint Admissions & Matriculation Board", "JAMB"]].map(([body, name, short], i) => ({ exam_body: body, name, short_name: short, primary_provider: "vtpass", fallback_provider: i ? "maskawasub" : null, convenience_fee: 100, cashback_percentage: 0, is_active: i !== 1, requires_profile_code: body === "jamb", instructions: null, portal_url: "https://example.com", maintenance_notice: null }));
export const educationPackages = Array.from({ length: 6 }, (_, i) => ({ id: `ep${i}`, exam_body: ["waec", "neco", "jamb"][i % 3], package_code: `edu-${i}`, name: ["WAEC Result Checker", "NECO Token", "JAMB UTME e-PIN", "WAEC GCE Registration", "NECO Registration", "JAMB Direct Entry"][i], description: null, service_type: ["result_checker", "result_checker", "utme", "registration", "registration", "de"][i], price: [3800, 1300, 6200, 18500, 17000, 6200][i], cost_price: [3500, 1100, 5900, 18000, 16500, 5900][i], is_active: i !== 4, sort_order: i }));
export const educationTransactions = tx("education");

export const bundleProviders = [{ id: "p1", name: "Maskawasub", status: "active" }, { id: "p2", name: "SMEPlug", status: "active" }];
export const bundles = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: ["MTN 5GB Data Share (30 Days)", "MTN 500MB Data Share (30 Days)", "MTN 1GB Data Share (7 Days)", "Airtel 2GB (30 Days)", "Glo 10GB (30 Days)", "MTN 3GB (30 Days)", "9mobile 1.5GB (30 Days)", "Airtel 750MB (14 Days)"][i], network: ["mtn", "mtn", "mtn", "airtel", "glo", "mtn", "9mobile", "airtel"][i], description: `${["mtn", "mtn", "mtn", "airtel", "glo", "mtn", "9mobile", "airtel"][i].toUpperCase()} · ${i === 2 ? "weekly" : "monthly"}`, provider_cost: [1550, 260, 365, 1400, 2700, 1150, 900, 520][i], selling_price: [1720, 295, 420, 1590, 3000, 1280, 1000, 600][i], status: ["active", "archived", "archived", "active", "draft", "active", "active", "draft"][i], metadata: { category: i === 2 ? "weekly" : "monthly" }, provider: { id: "p1", name: "Maskawasub" }, placement: null }));
export const bundleCategories = [{ network_slug: "mtn", slug: "monthly", name: "Monthly", sort_order: 1 }, { network_slug: "mtn", slug: "weekly", name: "Weekly", sort_order: 2 }, { network_slug: "airtel", slug: "monthly", name: "Monthly", sort_order: 1 }];

export const registry = ["Maskawasub", "VTPass", "SMEPlug", "Pairgate", "Bachs"].map((name, i) => ({ id: `r${i}`, name, slug: name.toLowerCase(), status: (["operational", "operational", "degraded", "standby", "operational"] as const)[i], capabilities: [["data", "airtime"], ["tv", "electricity", "education"], ["data"], ["airtime"], ["funding"]][i], priority: (i + 1) * 10, environment: (i === 3 ? "sandbox" : "live") as "sandbox" | "live", api_base_url: `https://api.${name.toLowerCase()}.com`, catalogue_endpoint: null, purchase_endpoint: null, requery_endpoint: null, balance_endpoint: null, api_secret_reference: null, webhook_secret_reference: null, documentation_url: null, website_url: null, support_email: null, support_phone: null, notes: null, last_catalogue_sync_at: iso(300) }));
export const catalogue = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, provider_id: `r${i % 3}`, network_slug: "mtn", provider_name: `MTN ${i + 1}GB`, provider_cost: 300 * (i + 1), is_available: true }));

export const coupons = ["WELCOME10", "DATA500", "FUNDA2026", "TVFRIDAY", "EXPIRED5"].map((code, i) => ({ id: `cp${i}`, code, discount_type: (i % 2 ? "fixed" : "percentage") as "fixed" | "percentage", discount_value: [10, 500, 5, 300, 5][i], min_purchase_amount: 1000, max_discount_amount: i % 2 ? null : 2000, service_type: ["all", "data", "all", "tv", "airtime"][i], max_uses: 500, times_used: [120, 44, 301, 12, 500][i], starts_at: iso(9000), expires_at: i === 4 ? iso(600) : i === 2 ? null : new Date(Date.UTC(2027, 0, 31)).toISOString(), is_active: i !== 3, created_at: iso(20000) }));

export const posts = ["How to Buy Data Cheaper in 2026", "Electricity Tokens: What Every Prepaid User Should Know", "Introducing Funda Rewards", "WAEC Result Checker Guide"].map((title, i) => ({ id: `post${i}`, title, slug: `post-${i}`, excerpt: "A short summary of the article.", category_slug: ["telecoms-data", "utilities", "product", "education"][i], tags: ["data"], author_name: "Funda Team", status: (["published", "published", "draft", "published"] as const)[i], published_at: i === 2 ? null : iso(3000 * (i + 1)), reading_time_minutes: 4 + i, views_count: [1820, 940, 0, 312][i], likes_count: [44, 12, 0, 6][i], is_featured: i === 0, featured_image: null, created_at: iso(4000 * (i + 1)) }));
export const categories = [{ id: "c1", name: "Telecoms & Data", slug: "telecoms-data", icon: "wifi", color: "#660033" }, { id: "c2", name: "Utilities", slug: "utilities", icon: "zap", color: "#660033" }, { id: "c3", name: "Product", slug: "product", icon: "grid", color: "#660033" }, { id: "c4", name: "Education", slug: "education", icon: "education", color: "#660033" }];
export const comments = ["Does this work for Airtel too?", "Thanks, very helpful!", "I bought a token but it hasn't arrived", "Yes, it works on all networks."].map((content, i) => ({ id: `cm${i}`, post_id: "post0", parent_id: i === 3 ? "cm0" : null, author_name: i === 3 ? "Funda Admin" : ["Kemi", "Yusuf", "Obinna"][i], author_email: "user@example.com", content, is_admin_reply: i === 3, is_approved: i !== 2, likes_count: i, created_at: iso(i * 200), post: { id: "post0", title: "How to Buy Data Cheaper in 2026", slug: "post-0" } }));
export const threads = ["Amina Bello", "Guest 4412", "Tunde Bakare"].map((name, i) => ({ id: `th${i}`, ticket_code: `FND-T${3021 + i}`, visitor_name: name, visitor_email: i === 1 ? null : "user@example.com", visitor_phone: "08163474155", current_page: "/data", status: (["open", "open", "resolved"] as const)[i], last_message: ["My data hasn't arrived", "Hello?", "Thanks, sorted!"][i], last_message_at: iso(i * 40), unread_support_count: i === 0 ? 2 : 0, created_at: iso(i * 60 + 30), messages: [{ id: `m${i}a`, thread_id: `th${i}`, sender_type: "user" as const, sender_name: name, message: "I bought 2GB but it hasn't arrived after 10 minutes.", telegram_message_id: null, created_at: iso(i * 40 + 10) }, { id: `m${i}b`, thread_id: `th${i}`, sender_type: "support" as const, sender_name: "Funda Support", message: "Sorry about that — checking with the provider now.", telegram_message_id: null, created_at: iso(i * 40) }] }));
