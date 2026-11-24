import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { rechargePrice, rechargePurchaseSchema, validateRechargePins, matchingAirtimeRule, parseRechargePinBatch } from "../../lib/recharge-cards.ts";
import { rechargeCardPrintHtml } from "../../lib/recharge-card-print.ts";
import { buildReceipt, receiptToText } from "../../app/dashboard/receipt.ts";

const user = "00000000-0000-4000-8000-000000000001";
const provider = "00000000-0000-4000-8000-000000000002";
const rule = "00000000-0000-4000-8000-000000000003";
const offer = "00000000-0000-4000-8000-000000000004";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const db = new PGlite();
const source = async (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const functionSql = (sql, name) => {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"));
  assert.ok(match, `Missing source procedure ${name}`);
  return match[0];
};

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table wallets(user_id uuid primary key,currency text,available_balance numeric default 0,updated_at timestamptz default now());
    create table service_transactions(id uuid primary key default gen_random_uuid(),internal_reference text unique,idempotency_key text unique,user_id uuid,service_type text,product_id uuid,provider_id uuid,provider_reference text,destination text,amount numeric,provider_cost numeric default 0,discount_amount numeric default 0,cashback_amount numeric default 0,platform_fee numeric default 0,gross_margin numeric,status text,metadata jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now(),completed_at timestamptz,failure_reason text);
    create table wallet_ledger_entries(id uuid primary key default gen_random_uuid(),user_id uuid,entry_type text,amount numeric,currency text,balance_after numeric,reference text unique,description text,metadata jsonb,created_at timestamptz default now());
    create table transaction_events(id uuid primary key default gen_random_uuid(),transaction_id uuid,event_type text,from_status text,to_status text,summary text,actor_type text,actor_id text,metadata jsonb,created_at timestamptz default now());
    create table provider_attempts(id uuid primary key default gen_random_uuid(),transaction_id uuid,provider_id uuid,attempt_number integer,outcome text,request_redacted jsonb,unique(transaction_id,attempt_number));
    create table cashback_awards(id uuid primary key default gen_random_uuid(),user_id uuid,transaction_id uuid unique,amount numeric,status text,ledger_entry_id uuid,credited_at timestamptz);
    create table feature_flags(key text primary key,enabled boolean);
    create table customer_account_controls(user_id uuid primary key,account_status text,wallet_status text);
    create table provider_registry(id uuid primary key,slug text,status text,environment text default 'live');
    create table admin_job_queue(id uuid primary key default gen_random_uuid(),job_type text,idempotency_key text unique,payload jsonb,run_at timestamptz default now());
    create table airtime_provider_routes(id uuid primary key default gen_random_uuid(),network text,mode text,min_amount numeric,max_amount numeric,priority integer,primary_provider text,fallback_provider text,discount_percentage numeric,cashback_percentage numeric,is_active boolean);
    create function lagos_day_start() returns timestamptz language sql stable as $$ select date_trunc('day',now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos' $$;
  `);
  await db.exec(functionSql(await source("202610260005_education_configs_and_packages.sql"), "customer_start_service_purchase_v2"));
  await db.exec(functionSql(await source("202610260001_payment_hardening.sql"), "customer_settle_service_purchase"));
  await db.exec(await source("202611230001_recharge_card_pipeline.sql"));
  await db.query("insert into wallets(user_id,currency,available_balance) values($1,'NGN',10000)", [user]);
  await db.query("insert into provider_registry(id,slug,status) values($1,'maskawasub','operational')",[provider]);
  await db.query("insert into feature_flags values('rewards.cashback',true)");
  await db.query("insert into airtime_provider_routes(id,network,mode,min_amount,max_amount,priority,primary_provider,discount_percentage,cashback_percentage,is_active) values($1,'all','epin',100,20000,1,'maskawasub',2,1,true)",[rule]);
  await db.query("insert into recharge_card_catalogue(id,network,denomination,provider_id,unit_cost,is_active) values($1,'mtn',100,$2,97,true)",[offer,provider]);
});
after(() => db.close());

let sequence = 0;
async function start(overrides = {}, key, cost = 194) {
  const seq = ++sequence;
  const snapshot = { network: "mtn", denomination: 100, quantity: 2, discountPercentage: 2, cashbackPercentage: 1, payable: 196, cashback: 1.96, ruleId:rule, catalogueId:offer, quoteId: hash("quote"), requestFingerprint: hash(`request${seq}`), ...overrides };
  const requestKey = key ?? `recharge-request-${seq.toString().padStart(8,"0")}`;
  const result = await db.query("select * from customer_start_recharge_card_purchase($1,$2,$3,$4,$5,$6,$7)", [user,requestKey,`FND-TEST-RECHARGE-${seq.toString().padStart(8,"0")}`,provider,snapshot,cost,{}]);
  return { ...result.rows[0], snapshot, requestKey };
}
async function settle(order, status, hashes = [], issue = null) {
  return (await db.query("select * from complete_recharge_card_purchase($1,$2,$3,$4,$5,$6,$7,$8)", [order.transaction_id,provider,status,"Verified provider evidence.","provider-proof",hashes.length ? "v1.encrypted-test-fixture" : null,hashes,issue])).rows[0];
}
const balance = async () => Number((await db.query("select available_balance from wallets where user_id=$1",[user])).rows[0].available_balance);

test("discount is deducted once and cashback uses the payable amount", () => {
  assert.deepEqual(rechargePrice(200,2,1), { faceValue:200,discount:4,payable:196,cashback:1.96 });
  assert.deepEqual(rechargePrice(300,2.5,0.5), { faceValue:300,discount:7.5,payable:292.5,cashback:1.46 });
  assert.throws(() => rechargePrice(100,100,0));
  assert.throws(() => rechargePrice(NaN,2,0));
});

test("recharge input rejects fractional quantities and mismatched totals", () => {
  const base = { serviceType:"airtime",mode:"epin",network:"mtn",amount:200,quantity:2,quoteId:hash("quote"),idempotencyKey:"valid-request-key-1234" };
  assert.equal(rechargePurchaseSchema.parse(base).denomination,100);
  assert.throws(() => rechargePurchaseSchema.parse({...base,quantity:1.5}));
  assert.throws(() => rechargePurchaseSchema.parse({...base,amount:210}));
  assert.throws(() => rechargePurchaseSchema.parse({...base,quantity:21}));
});

test("only an exact complete, unique PIN batch is deliverable", () => {
  const expected = { network:"mtn",denomination:100,quantity:2 };
  const first = {pin:"0012 3456 7890 1234",amount:100,network:"mtn"};
  const second = {pin:"0012345678901235",amount:100,network:"mtn"};
  assert.equal(validateRechargePins([first,second],expected).issue,null);
  assert.equal(validateRechargePins([first,second],expected).pins[0].pin,"0012345678901234");
  assert.equal(validateRechargePins([first,first],expected).issue,"duplicate_pin_batch");
  assert.equal(validateRechargePins([first],expected).issue,"partial_pin_batch");
  assert.equal(validateRechargePins([],expected).issue,"missing_pin_batch");
  assert.equal(validateRechargePins([{...first,network:"glo"}],expected).issue,"invalid_pin_batch");
});

test("routing is deterministic across overlapping scopes and unordered results", () => {
  const base = {network:"all",mode:"all",min_amount:50,max_amount:20000,priority:100,primary_provider:"maskawasub",fallback_provider:null,discount_percentage:2,cashback_percentage:0};
  const rules = [{...base,id:"z"},{...base,id:"a",network:"mtn",mode:"epin",priority:1},{...base,id:"b",network:"mtn",mode:"epin",priority:2}];
  assert.equal(matchingAirtimeRule(rules,"mtn","epin",200).id,"b");
  assert.equal(matchingAirtimeRule(rules.reverse(),"mtn","epin",200).id,"b");
});

test("recovery imports validate both JSON and line batches without accepting duplicates", () => {
  const expected = { network:"mtn",denomination:100,quantity:2 };
  assert.equal(parseRechargePinBatch("0012345678901234, A\n0012345678901235, B",expected).length,2);
  assert.equal(parseRechargePinBatch('[{"pin":"0012345678901234"},{"pin":"0012345678901235"}]',expected).length,2);
  assert.throws(() => parseRechargePinBatch("0012345678901234\n0012345678901234",expected));
  assert.throws(() => parseRechargePinBatch("0012345678901234",expected));
});

test("printable cards preserve leading zeroes and escape all supplier/customer text", () => {
  const html = rechargeCardPrintHtml([{ pin:"0012345678901234",amount:100,network:"mtn",serial:'<img src=x onerror=alert(1)>' }],'<script>alert(1)</script>',"FND-TEST");
  assert.ok(html.includes("0012 3456 7890 1234"));
  assert.ok(html.includes("*311*0012345678901234#"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
});

test("shareable payment receipts include savings and delivery counts but exclude bearer PINs", () => {
  const receipt = buildReceipt({ id:"test",title:"Recharge cards",category:"airtime",type:"debit",amount:196,date:"Today",time:"9 AM",status:"completed",meta:"MTN",reference:"FND-TEST",mode:"epin",quantity:2,unitAmount:100,faceValue:200,originalAmount:200,discountAmount:4,pinCount:2,pins:[{pin:"0012345678901234",amount:100}] },{customerName:"Customer"});
  const text = receiptToText(receipt);
  assert.ok(text.includes("Face value: ₦200.00"));
  assert.ok(text.includes("Discount: −₦4.00"));
  assert.ok(text.includes("PINs delivered: 2 / 2"));
  assert.ok(!text.includes("0012345678901234"));
  assert.ok(!text.includes("Plan price"));
});

test("purchase replay debits once and rejects a different payload", async () => {
  const beforeBalance = await balance();
  const order = await start();
  const replay = await start(order.snapshot,order.requestKey);
  assert.equal(replay.reused,true);
  assert.equal(replay.transaction_id,order.transaction_id);
  assert.equal(await balance(),beforeBalance-196);
  await assert.rejects(start({...order.snapshot,requestFingerprint:hash("different")},order.requestKey),/different purchase/);
  const jobs = await db.query("select * from admin_job_queue where payload->>'transactionId'=$1",[order.transaction_id]);
  assert.equal(jobs.rows.length,1);
});

test("successful delivery is atomic, credits committed cashback once, and reports net margin", async () => {
  const beforeBalance = await balance();
  const order = await start();
  const hashes = [hash("success-one"),hash("success-two")];
  const completed = await settle(order,"successful",hashes);
  assert.equal(completed.status,"successful");
  assert.equal(await balance(),beforeBalance-196+1.96);
  await settle(order,"successful",hashes);
  assert.equal(await balance(),beforeBalance-196+1.96);
  const tx = (await db.query("select amount,discount_amount,gross_margin from service_transactions where id=$1",[order.transaction_id])).rows[0];
  assert.equal(Number(tx.amount),196);
  assert.equal(Number(tx.discount_amount),4);
  assert.equal(Number(tx.gross_margin),0.04);
});

test("missing and partial batches hold the debit without cashback or speculative refunds", async () => {
  const beforeBalance = await balance();
  const order = await start();
  assert.equal((await settle(order,"successful")).status,"pending");
  assert.equal((await settle(order,"successful",[hash("partial")])).status,"pending");
  assert.equal((await settle(order,"failed")).status,"pending");
  assert.equal(await balance(),beforeBalance-196);
  await assert.rejects(db.query("update service_transactions set status='successful' where id=$1",[order.transaction_id]),/verified PIN batch/);
});

test("a PIN cannot fulfil two orders even if both providers claim success", async () => {
  const first = await start();
  const second = await start();
  const hashes = [hash("shared-one"),hash("shared-two")];
  assert.equal((await settle(first,"successful",hashes)).status,"successful");
  assert.equal((await settle(second,"successful",hashes)).status,"pending");
  const tx = (await db.query("select metadata->>'deliveryStatus' as delivery from service_transactions where id=$1",[second.transaction_id])).rows[0];
  assert.equal(tx.delivery,"pin_conflict");
});

test("confirmed non-delivery refunds only the actual debit and cannot be repeated", async () => {
  const beforeBalance = await balance();
  const order = await start();
  const result = await settle(order,"failed");
  assert.equal(result.refunded,true);
  assert.equal(await balance(),beforeBalance);
  assert.equal((await settle(order,"failed")).refunded,false);
  assert.equal(await balance(),beforeBalance);
});

test("ordinary status tools cannot label an uncertain card order failed", async () => {
  const order = await start();
  await assert.rejects(db.query("update service_transactions set status='failed' where id=$1",[order.transaction_id]),/confirmed provider non-delivery/);
});

test("route additions reject unsupported PIN adapters and ambiguous overlapping rules", async () => {
  const insert = "insert into airtime_provider_routes(network,mode,min_amount,max_amount,priority,primary_provider,discount_percentage,cashback_percentage,is_active) values('mtn','epin',100,2000,10,$1,2,0,true)";
  await assert.rejects(db.query(insert,["vtpass"]),/supported PIN provider/);
  await db.query(insert,["maskawasub"]);
  await assert.rejects(db.query(insert,["maskawasub"]),/overlaps/);
});

test("pausing a route or freezing the wallet prevents a debit under the database lock", async () => {
  const beforeBalance = await balance();
  await db.query("update airtime_provider_routes set is_active=false where id=$1",[rule]);
  await assert.rejects(start(),/route changed/);
  await db.query("update airtime_provider_routes set is_active=true where id=$1",[rule]);
  await db.query("insert into customer_account_controls values($1,'active','frozen')",[user]);
  await assert.rejects(start(),/restricted/);
  await db.query("delete from customer_account_controls where user_id=$1",[user]);
  assert.equal(await balance(),beforeBalance);
});

test("cashback policy changes invalidate checkout while a committed reward survives a later pause", async () => {
  const order = await start();
  await db.query("update feature_flags set enabled=false where key='rewards.cashback'");
  await assert.rejects(start(),/route changed/);
  const beforeBalance = await balance();
  await settle(order,"successful",[hash("reward-one"),hash("reward-two")]);
  assert.equal(await balance(),beforeBalance+1.96);
  await db.query("update feature_flags set enabled=true where key='rewards.cashback'");
});

test("unsupported environments, catalogue pauses, quantity caps and loss-making prices cannot charge", async () => {
  const beforeBalance = await balance();
  await db.query("update provider_registry set environment='sandbox' where id=$1",[provider]);
  await assert.rejects(start(),/route changed/);
  await db.query("update provider_registry set environment='live' where id=$1",[provider]);
  await db.query("update recharge_card_catalogue set is_active=false where id=$1",[offer]);
  await assert.rejects(start(),/pricing changed/);
  await db.query("update recharge_card_catalogue set is_active=true,max_quantity=1 where id=$1",[offer]);
  await assert.rejects(start(),/pricing changed/);
  await db.query("update recharge_card_catalogue set max_quantity=20,unit_cost=98 where id=$1",[offer]);
  await assert.rejects(start({},undefined,196),/below the verified provider cost/);
  await db.query("update recharge_card_catalogue set unit_cost=97 where id=$1",[offer]);
  assert.equal(await balance(),beforeBalance);
});

test("reporting excludes pending debits from sales and never exposes PIN storage", async () => {
  const report = (await db.query("select recharge_card_summary(now()-interval '1 day',now()+interval '1 day') as data")).rows[0].data;
  assert.equal(report.ready,3);
  assert.equal(Number(report.sales),588);
  assert.equal(Number(report.pins),6);
  const columns = (await db.query("select * from recharge_card_operations limit 1")).fields.map(field => field.name);
  assert.ok(!columns.includes("metadata"));
  assert.ok(!columns.includes("pins_encrypted"));
});

test("customer database roles cannot call the money procedures", async () => {
  await db.exec("set role authenticated");
  try {
    await assert.rejects(db.query("select * from complete_recharge_card_purchase(null,null,'failed','no',null,null,'{}',null,null)"),/permission denied/);
  } finally { await db.exec("reset role"); }
});

test("historical PIN ownership must be reconciled before new orders and protects future purchases", async () => {
  const legacyId = "00000000-0000-4000-8000-000000000099";
  await db.query("insert into service_transactions(id,internal_reference,idempotency_key,user_id,service_type,provider_id,amount,status,metadata) values($1,'LEGACY','legacy-request-1234',$2,'airtime',$3,200,'successful',$4)",[legacyId,user,provider,{mode:"epin",network:"mtn",quantity:2,unitAmount:100,pins:[{pin:"0012345678901234"}]}]);
  await assert.rejects(start(),/inventory is being reconciled/);
  const hashes = [hash("legacy-one"),hash("legacy-two")];
  await db.query("select register_legacy_recharge_pins($1,$2,$3)",[legacyId,"v1.sealed-legacy",hashes]);
  const row = (await db.query("select metadata from service_transactions where id=$1",[legacyId])).rows[0].metadata;
  assert.equal(row.pinClaimsVersion,1);
  assert.equal(row.deliveryStatus,"ready");
  assert.equal(row.pins,undefined);
  const fresh = await start();
  assert.equal((await settle(fresh,"successful",hashes)).status,"pending");
});

test("late delivery after refund is quarantined without another debit and requires evidence to close", async () => {
  const beforeBalance = await balance();
  const order = await start();
  await settle(order,"failed");
  const pins = [hash("late-one"),hash("late-two")];
  assert.equal((await settle(order,"successful",pins)).status,"failed");
  assert.equal(await balance(),beforeBalance);
  const row = (await db.query("select metadata from service_transactions where id=$1",[order.transaction_id])).rows[0].metadata;
  assert.equal(row.reconciliationIssue,"late_delivery");
  assert.equal(row.deliveryStatus,"late_delivery_conflict");
  assert.equal(row.pins_encrypted,undefined);
  assert.equal(row.late_pins_encrypted,"v1.encrypted-test-fixture");
  await assert.rejects(db.query("select close_recharge_investigation($1,'','insufficient','admin')",[order.transaction_id]),/evidence/);
  await db.query("select close_recharge_investigation($1,'Provider revocation #123','Provider revoked the late PIN batch.','admin')",[order.transaction_id]);
  const closed = (await db.query("select metadata from service_transactions where id=$1",[order.transaction_id])).rows[0].metadata;
  assert.equal(closed.reconciliationIssue,undefined);
  assert.equal(closed.deliveryStatus,"refunded");
  assert.equal(await balance(),beforeBalance);
  const next = await start();
  assert.equal((await settle(next,"successful",pins)).status,"pending");
});

test("failure after verified delivery records a conflict without refunding or losing PINs", async () => {
  const order = await start();
  await settle(order,"successful",[hash("delivered-one"),hash("delivered-two")]);
  const beforeBalance = await balance();
  assert.equal((await settle(order,"failed")).status,"successful");
  assert.equal(await balance(),beforeBalance);
  const meta = (await db.query("select metadata from service_transactions where id=$1",[order.transaction_id])).rows[0].metadata;
  assert.equal(meta.reconciliationIssue,"provider_status_conflict");
  assert.equal(meta.deliveryStatus,"ready");
});

test("statement cost reconciliation updates the margin and audit trail without touching the wallet", async () => {
  const order = await start();
  await settle(order,"successful",[hash("cost-one"),hash("cost-two")]);
  const beforeBalance = await balance();
  await db.query("select record_recharge_provider_cost($1,190.50,'STATEMENT-123','Matched against the provider statement.','admin')",[order.transaction_id]);
  const row = (await db.query("select provider_cost,gross_margin,metadata from service_transactions where id=$1",[order.transaction_id])).rows[0];
  assert.equal(Number(row.provider_cost),190.5);
  assert.equal(Number(row.gross_margin),3.54);
  assert.equal(row.metadata.provider_cost_source,"provider_statement");
  assert.equal(await balance(),beforeBalance);
  const events = await db.query("select id from transaction_events where transaction_id=$1 and event_type='provider_cost_reconciled'",[order.transaction_id]);
  assert.equal(events.rows.length,1);
});
