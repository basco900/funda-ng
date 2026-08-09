import { vendors } from "@/lib/test-engine/vendors";

export async function GET() {
  return Response.json({
    mode: process.env.TRANSACTION_MODE === "live" ? "live" : "sandbox",
    paymentReady: Boolean(process.env.FLW_SECRET_KEY),
    vendors: {
      vtpass: vendors.vtpass.isConfigured(),
      smeplug: vendors.smeplug.isConfigured(),
      gladtidings: vendors.gladtidings.isConfigured(),
      pairgate: vendors.pairgate.isConfigured(),
    },
    vendorNotes: {
      pairgate: vendors.pairgate.isConfigured()
        ? process.env.PAIRGATE_TEST_MODE === "false" ? "Live" : "Test mode"
        : "Awaiting key",
    },
    testUser: {
      name: process.env.TEST_USER_NAME || "Test Customer",
      email: process.env.TEST_USER_EMAIL || "test@example.com",
      phone: process.env.TEST_USER_PHONE || "08011111111",
    },
  });
}
