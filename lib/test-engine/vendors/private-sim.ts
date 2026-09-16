import type { DataPlan, NetworkId, PurchaseInput, PurchaseResult, VtuVendor } from "../types";
import { createSimJob, getGatewayHealth, getJobById } from "../../services/sim-gateway";

const standardMtnSmePlans: DataPlan[] = [
  { id: "1", name: "MTN 500MB SME (30 Days)", amount: 120, validity: "30 days", network: "mtn", vendor: "private_sim" },
  { id: "2", name: "MTN 1GB SME (30 Days)", amount: 240, validity: "30 days", network: "mtn", vendor: "private_sim" },
  { id: "3", name: "MTN 2GB SME (30 Days)", amount: 480, validity: "30 days", network: "mtn", vendor: "private_sim" },
  { id: "4", name: "MTN 3GB SME (30 Days)", amount: 720, validity: "30 days", network: "mtn", vendor: "private_sim" },
  { id: "5", name: "MTN 5GB SME (30 Days)", amount: 1200, validity: "30 days", network: "mtn", vendor: "private_sim" },
  { id: "6", name: "MTN 10GB SME (30 Days)", amount: 2400, validity: "30 days", network: "mtn", vendor: "private_sim" },
];

export const privateSim: VtuVendor = {
  id: "private_sim",
  isConfigured: () => {
    // Enabled if configured in .env or if gateway devices are connected
    return process.env.PRIVATE_SIM_ENABLED !== "false";
  },

  async getDataPlans(network: NetworkId): Promise<DataPlan[]> {
    if (network === "mtn") return standardMtnSmePlans;
    return [
      { id: "1", name: `${network.toUpperCase()} 500MB (30 Days)`, amount: 130, validity: "30 days", network, vendor: "private_sim" },
      { id: "2", name: `${network.toUpperCase()} 1GB (30 Days)`, amount: 250, validity: "30 days", network, vendor: "private_sim" },
      { id: "3", name: `${network.toUpperCase()} 2GB (30 Days)`, amount: 500, validity: "30 days", network, vendor: "private_sim" },
      { id: "5", name: `${network.toUpperCase()} 5GB (30 Days)`, amount: 1250, validity: "30 days", network, vendor: "private_sim" },
    ];
  },

  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    const health = getGatewayHealth();
    
    // Create the USSD job in queue
    const job = createSimJob({
      reference: input.reference,
      network: input.network,
      phone: input.phone,
      planId: input.planId || "2",
      planName: `${input.network.toUpperCase()} ${input.planId} Data`,
    });

    // Wait up to 25 seconds for the Android dispenser to complete the USSD dial
    const maxWaitMs = 25_000;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 1000));
      const current = getJobById(job.id);
      if (!current) break;

      if (current.status === "successful") {
        return {
          status: "successful",
          reference: input.reference,
          providerReference: current.id,
          message: current.responseText || "Data transfer delivered successfully via Private SIM Gateway.",
          raw: current,
        };
      }

      if (current.status === "failed") {
        return {
          status: "failed",
          reference: input.reference,
          providerReference: current.id,
          message: current.responseText || "SIM USSD transfer could not be completed by device.",
          raw: current,
        };
      }
    }

    // If still in progress after 25s, return pending so background reconciles
    return {
      status: "pending",
      reference: input.reference,
      providerReference: job.id,
      message: health.onlineDevicesCount > 0
        ? "USSD transfer queued and processing on your dispensing device."
        : "Job queued on Private SIM Gateway. Device will dispense once connected.",
      raw: job,
    };
  },

  async requery(reference: string): Promise<PurchaseResult> {
    const job = getJobById(reference);
    if (!job) {
      return {
        status: "pending",
        reference,
        message: "SIM Gateway job status pending.",
      };
    }
    return {
      status: job.status === "successful" ? "successful" : job.status === "failed" ? "failed" : "pending",
      reference,
      providerReference: job.id,
      message: job.responseText || `SIM Gateway status: ${job.status}`,
      raw: job,
    };
  },
};
