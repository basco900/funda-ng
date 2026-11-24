import type { TransactionItem } from "./dashboard-client";

export type ReceiptField = { label: string; value: string; copyable?: boolean; tone?: "reward" };
export type ReceiptSection = { title: string; fields: ReceiptField[] };

export type Receipt = {
  direction: "in" | "out";
  status: TransactionItem["status"];
  statusLabel: string;
  amountText: string;
  title: string;
  reference: string;
  sections: ReceiptSection[];
};

type ReceiptContext = {
  customerName: string;
  customerPhone?: string | null;
  virtualAccount?: { account_number: string | null; bank_name: string | null; account_name: string | null } | null;
};

const SERVICE_LABELS: Record<TransactionItem["category"], string> = {
  data: "Mobile data",
  airtime: "Airtime",
  electricity: "Electricity",
  tv: "Cable TV",
  education: "Education & Exams",
  internet: "Broadband",
  funding: "Wallet top-up",
};

const RECIPIENT_LABELS: Partial<Record<TransactionItem["category"], string>> = {
  electricity: "Meter number",
  tv: "Smartcard / IUC",
  education: "Candidate Phone / Profile",
  internet: "Account ID",
};

const naira = (value: number) => `₦${value.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Keep enough of the account number to recognise it without printing it in full.
function maskAccount(account: string) {
  const digits = account.replace(/\s+/g, "");
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 2)}${"•".repeat(digits.length - 6)}${digits.slice(-4)}`;
}

function formatWhen(tx: TransactionItem) {
  if (!tx.createdAt) return `${tx.date}, ${tx.time}`;
  return new Date(tx.createdAt).toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const push = (fields: ReceiptField[], label: string, value: string | null | undefined, extra?: Partial<ReceiptField>) => {
  if (value && value.trim()) fields.push({ label, value: value.trim(), ...extra });
};

export function buildReceipt(tx: TransactionItem, ctx: ReceiptContext): Receipt {
  const isCredit = tx.type === "credit";
  const sections: ReceiptSection[] = [];

  if (isCredit) {
    const isTransfer = tx.channel === "virtual_account";
    const from: ReceiptField[] = [];
    push(from, "Sender", tx.senderName);
    push(from, "Bank", tx.senderBank);
    push(from, "Account number", tx.senderAccount ? maskAccount(tx.senderAccount) : null);
    push(from, "Method", isTransfer ? "Bank transfer" : tx.channel === "checkout" ? "Bachs Checkout" : tx.meta);
    push(from, "Narration", tx.narration);
    sections.push({ title: "From", fields: from });

    const to: ReceiptField[] = [];
    push(to, "Beneficiary", ctx.customerName);
    push(to, "Credited to", "Funda Wallet");
    if (isTransfer && ctx.virtualAccount?.account_number) {
      push(to, "Via account", `${ctx.virtualAccount.bank_name ?? "Bank"} · ${ctx.virtualAccount.account_number}`);
    }
    sections.push({ title: "To", fields: to });
  } else {
    const paidBy: ReceiptField[] = [];
    push(paidBy, "Customer", ctx.customerName);
    push(paidBy, "Phone", ctx.customerPhone);
    push(paidBy, "Paid from", "Funda Wallet");
    sections.push({ title: "Paid by", fields: paidBy });

    const service: ReceiptField[] = [];
    push(service, "Service", tx.mode === "epin" ? "Recharge cards" : SERVICE_LABELS[tx.category]);
    push(service, "Product", tx.title);
    if (tx.mode === "epin") {
      push(service, "Cards", tx.quantity && tx.unitAmount ? `${tx.quantity} × ${naira(tx.unitAmount)}` : undefined);
      push(service, "Face value", tx.faceValue ? naira(tx.faceValue) : undefined);
      push(service, "PINs delivered", tx.pinCount !== undefined ? `${tx.pinCount} / ${tx.quantity ?? tx.pinCount}` : undefined);
    } else push(service, RECIPIENT_LABELS[tx.category] ?? "Recipient", tx.meta);
    if (tx.originalAmount && tx.discountAmount && tx.discountAmount > 0) {
      if (tx.mode !== "epin") push(service, "Plan price", naira(tx.originalAmount));
      push(
        service,
        "Discount",
        `−${naira(tx.discountAmount)}${tx.couponCode ? ` (${tx.couponCode})` : ""}`,
        { tone: "reward" },
      );
    }
    if (tx.token) push(service, tx.category === "education" ? "Exam PIN / Token" : "Electricity Token", tx.token, { copyable: true });
    push(service, "Cashback", tx.cashback, { tone: "reward" });
    sections.push({ title: "Service", fields: service });
  }

  const details: ReceiptField[] = [];
  push(details, "Date & time", formatWhen(tx));
  push(details, "Reference", tx.reference, { copyable: true });
  push(details, "Provider ref", tx.providerReference);
  sections.push({ title: "Transaction", fields: details });

  const statusLabel =
    tx.status === "failed"
      ? isCredit ? "Payment failed" : tx.mode === "epin" && !tx.refunded ? "Purchase failed" : "Payment failed (refunded)"
      : tx.status === "processing"
      ? "Processing"
      : isCredit ? "Money received" : "Payment completed";

  return {
    direction: isCredit ? "in" : "out",
    status: tx.status,
    statusLabel,
    amountText: `${isCredit ? "+" : "−"}${naira(tx.amount)}`,
    title: tx.title,
    reference: tx.reference,
    sections: sections.filter((section) => section.fields.length > 0),
  };
}

export function receiptToText(receipt: Receipt) {
  const lines = ["Funda Transaction Receipt", "", `${receipt.amountText} · ${receipt.statusLabel}`, receipt.title];
  for (const section of receipt.sections) {
    lines.push("", section.title.toUpperCase());
    for (const field of section.fields) lines.push(`${field.label}: ${field.value}`);
  }
  lines.push("", "funda.ng");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Image rendering (PNG) for download and file sharing
// ---------------------------------------------------------------------------

const COLORS = {
  page: "#f4f3f1",
  card: "#ffffff",
  brand: "#660033",
  ink: "#0b0b0c",
  muted: "#6f6e6b",
  line: "#ecebe8",
  reward: "#8a6420",
  status: { completed: "#15803d", processing: "#b45309", failed: "#dc2626" } as const,
};

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

export async function renderReceiptImage(receipt: Receipt): Promise<Blob> {
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  await document.fonts?.ready;

  const width = 720;
  const pad = 32;
  const cardX = 24;
  const cardW = width - cardX * 2;
  const headerH = 300;
  const rowH = 38;
  const sectionGap = 22;
  const sectionsH = receipt.sections.reduce((sum, s) => sum + 30 + s.fields.length * rowH + sectionGap, 0);
  const footerH = 96;
  const height = cardX + headerH + sectionsH + footerH + cardX;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.scale(scale, scale);
  ctx.textBaseline = "middle";

  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, width, height);

  // Card
  roundedRect(ctx, cardX, cardX, cardW, height - cardX * 2, 18);
  ctx.fillStyle = COLORS.card;
  ctx.fill();

  // Brand band
  ctx.save();
  roundedRect(ctx, cardX, cardX, cardW, 88, 18);
  ctx.clip();
  ctx.fillStyle = COLORS.brand;
  ctx.fillRect(cardX, cardX, cardW, 88);
  ctx.restore();
  ctx.fillStyle = COLORS.brand;
  ctx.fillRect(cardX, cardX + 60, cardW, 28);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 28px ${family}`;
  ctx.textAlign = "left";
  ctx.fillText("funda.", cardX + pad, cardX + 44);
  ctx.font = `500 14px ${family}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Transaction Receipt", cardX + cardW - pad, cardX + 44);

  // Amount + status
  const centerX = width / 2;
  ctx.textAlign = "center";
  ctx.fillStyle = receipt.status === "failed" ? COLORS.muted : receipt.direction === "in" ? COLORS.status.completed : COLORS.ink;
  ctx.font = `700 46px ${family}`;
  ctx.fillText(receipt.amountText, centerX, cardX + 150);

  const statusColor = COLORS.status[receipt.status];
  ctx.font = `700 13px ${family}`;
  const pillText = receipt.statusLabel.toUpperCase();
  const pillW = ctx.measureText(pillText).width + 28;
  roundedRect(ctx, centerX - pillW / 2, cardX + 186, pillW, 28, 8);
  ctx.fillStyle = `${statusColor}1a`;
  ctx.fill();
  ctx.fillStyle = statusColor;
  ctx.fillText(pillText, centerX, cardX + 200);

  ctx.font = `500 17px ${family}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(fitText(ctx, receipt.title, cardW - pad * 2), centerX, cardX + 244);

  // Sections
  let y = cardX + headerH;
  for (const section of receipt.sections) {
    ctx.textAlign = "left";
    ctx.font = `700 11px ${family}`;
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(section.title.toUpperCase().split("").join(String.fromCharCode(8202)), cardX + pad, y + 10);
    y += 30;
    section.fields.forEach((field, index) => {
      if (index > 0) {
        ctx.fillStyle = COLORS.line;
        ctx.fillRect(cardX + pad, y, cardW - pad * 2, 1);
      }
      ctx.textAlign = "left";
      ctx.font = `500 14px ${family}`;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(field.label, cardX + pad, y + rowH / 2);
      ctx.textAlign = "right";
      ctx.font = `600 14px ${family}`;
      ctx.fillStyle = field.tone === "reward" ? COLORS.reward : COLORS.ink;
      const labelW = ctx.measureText(field.label).width;
      ctx.fillText(fitText(ctx, field.value, cardW - pad * 2 - labelW - 40), cardX + cardW - pad, y + rowH / 2);
      y += rowH;
    });
    y += sectionGap;
  }

  // Footer
  ctx.fillStyle = COLORS.line;
  ctx.fillRect(cardX + pad, y, cardW - pad * 2, 1);
  ctx.textAlign = "center";
  ctx.font = `600 13px ${family}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText("Thank you for using Funda", centerX, y + 32);
  ctx.font = `400 12px ${family}`;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(
    `funda.ng · Generated ${new Date().toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}`,
    centerX,
    y + 56,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create image"))), "image/png");
  });
}

export function receiptFileName(receipt: Receipt) {
  return `funda-receipt-${receipt.reference.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "transaction"}.png`;
}
