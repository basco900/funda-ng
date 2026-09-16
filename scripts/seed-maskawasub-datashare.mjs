import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://supabase.funda.ng";
const key = process.env.SUPABASE_SECRET_KEY;
if (!key) {
  console.error("SUPABASE_SECRET_KEY missing");
  process.exit(1);
}

const sb = createClient(url, key);

const MASKAWASUB_PROVIDER_ID = "61ef7fd2-09a1-4a10-a278-9c6b4ecd9278";

const plans = [
  {
    code: "462",
    name: "MTN 500MB Data Share (30 Days)",
    description: "30 Days MTN Data Share",
    mb: 500,
    cost: 260,
    price: 295,
    validity: "30 days",
    category: "monthly",
    featured: false,
  },
  {
    code: "370",
    name: "MTN 1GB Data Share (7 Days)",
    description: "7 Days MTN Data Share",
    mb: 1000,
    cost: 365,
    price: 420,
    validity: "7 days",
    category: "weekly",
    featured: false,
  },
  {
    code: "512",
    name: "MTN 1GB Data Share (30 Days)",
    description: "30 Days MTN Data Share",
    mb: 1000,
    cost: 530,
    price: 595,
    validity: "30 days",
    category: "monthly",
    featured: true,
  },
  {
    code: "371",
    name: "MTN 2GB Data Share (30 Days)",
    description: "30 Days MTN Data Share",
    mb: 2000,
    cost: 800,
    price: 890,
    validity: "30 days",
    category: "monthly",
    featured: false,
  },
  {
    code: "373",
    name: "MTN 3GB Data Share (30 Days)",
    description: "30 Days MTN Data Share",
    mb: 3000,
    cost: 1150,
    price: 1280,
    validity: "30 days",
    category: "monthly",
    featured: false,
  },
  {
    code: "372",
    name: "MTN 5GB Data Share (30 Days)",
    description: "30 Days MTN Data Share",
    mb: 5000,
    cost: 1550,
    price: 1720,
    validity: "30 days",
    category: "monthly",
    featured: false,
  },
];

async function seed() {
  console.log("1. Upserting provider_catalogue_items for Maskawasub...");
  const catalogueRows = plans.map((p) => ({
    provider_id: MASKAWASUB_PROVIDER_ID,
    service_type: "data",
    network_slug: "mtn",
    provider_product_code: p.code,
    provider_name: p.name,
    data_amount_mb: p.mb,
    validity_hours: p.validity.includes("7") ? 168 : 720,
    validity_label: p.validity,
    provider_cost: p.cost,
    currency: "NGN",
    is_available: true,
    raw_payload: { source: "manual_seed", vendor: "maskawasub", plan: p },
    imported_at: new Date().toISOString(),
  }));

  const { error: catErr } = await sb
    .from("provider_catalogue_items")
    .upsert(catalogueRows, { onConflict: "provider_id,provider_product_code" });
  if (catErr) {
    console.error("Failed to upsert catalogue items:", catErr);
  } else {
    console.log("Upserted catalogue items successfully.");
  }

  console.log("2. Cleaning old cg2 and temporary service_products...");
  await sb.from("service_products").delete().like("provider_product_code", "cg2_%");
  await sb.from("service_products").delete().like("provider_product_code", "maskawa_ds_%");

  console.log("3. Seeding active service_products for front-end...");
  for (const p of plans) {
    const { data: existing } = await sb
      .from("service_products")
      .select("id")
      .eq("provider_id", MASKAWASUB_PROVIDER_ID)
      .eq("provider_product_code", p.code)
      .maybeSingle();

    const record = {
      name: p.name,
      service_type: "data",
      network: "mtn",
      description: p.description,
      provider_cost: p.cost,
      selling_price: p.price,
      cashback_amount: 5,
      status: "active",
      provider_id: MASKAWASUB_PROVIDER_ID,
      provider_product_code: p.code,
      validity: p.validity,
      featured: p.featured,
      metadata: {
        category: p.category,
        data_amount_mb: p.mb,
      },
    };

    if (existing) {
      await sb.from("service_products").update(record).eq("id", existing.id);
      console.log(`Updated product: ${p.name}`);
    } else {
      await sb.from("service_products").insert(record);
      console.log(`Inserted product: ${p.name}`);
    }
  }

  console.log("Done!");
}

seed().catch(console.error);
