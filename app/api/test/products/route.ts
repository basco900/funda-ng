import type { NetworkId, VendorId } from "@/lib/test-engine/types";
import { getVendor } from "@/lib/test-engine/vendors";
import { safeError } from "@/lib/test-engine/utils";

const networks = new Set(["mtn", "airtel", "glo", "9mobile"]);
const vendorIds = new Set(["vtpass", "smeplug", "gladtidings", "pairgate"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const network = url.searchParams.get("network") ?? "";
  const vendor = url.searchParams.get("vendor") ?? "";
  if (!networks.has(network) || !vendorIds.has(vendor)) {
    return Response.json({ error: "Choose a valid network and vendor." }, { status: 400 });
  }
  try {
    const adapter = getVendor(vendor as VendorId);
    if (!adapter.isConfigured()) return Response.json({ error: `${vendor} is not configured yet.` }, { status: 503 });
    const plans = await adapter.getDataPlans(network as NetworkId);
    return Response.json({ plans });
  } catch (error) {
    return Response.json({ error: safeError(error) }, { status: 502 });
  }
}
