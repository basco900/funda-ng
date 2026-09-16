import { isNigerianPhone, normalizePhone } from "../test-engine/utils";

export interface SimDispenseJob {
  id: string;
  reference: string;
  network: "mtn" | "airtel" | "glo" | "9mobile";
  phone: string;
  planId: string;
  planName: string;
  ussdCommand: string;
  simSlot: number;
  status: "queued" | "dispatched" | "successful" | "failed" | "timed_out";
  createdAt: string;
  dispatchedAt?: string;
  completedAt?: string;
  responseText?: string;
  deviceId?: string;
}

export interface SimDeviceStatus {
  deviceId: string;
  deviceName: string;
  batteryLevel?: number;
  isCharging?: boolean;
  signalStrength?: string;
  simSlot1Network?: string;
  simSlot2Network?: string;
  lastSeenAt: string;
  status: "online" | "offline";
}

// In-memory queue with persistent Supabase fallback
const jobQueue = new Map<string, SimDispenseJob>();
const connectedDevices = new Map<string, SimDeviceStatus>();

// USSD Code Generators for Nigerian Networks
export function generateUssdCommand(network: string, planCode: string, recipientPhone: string, pin = "1234"): string {
  const cleanPhone = normalizePhone(recipientPhone);
  const normalized = cleanPhone.startsWith("234") ? `0${cleanPhone.slice(3)}` : cleanPhone;

  switch (network.toLowerCase()) {
    case "mtn":
      // MTN SME Plus format: *461*1*Phone*PlanCode*PIN#
      // Standard plan codes: 1=500MB, 2=1GB, 3=2GB, 4=3GB, 5=5GB, 6=10GB
      if (/^\d+$/.test(planCode) && Number(planCode) <= 10) {
        return `*461*1*${normalized}*${planCode}*${pin}#`;
      }
      // MTN Data Gifting format: *312*PlanCode*Phone*PIN#
      return `*312*${planCode}*${normalized}*${pin}#`;

    case "airtel":
      // Airtel SME / Corporate Share format
      return `*312*${planCode}*${normalized}*${pin}#`;

    case "glo":
      // Glo Data Share format: *127*01*Phone#
      return `*127*01*${normalized}#`;

    case "9mobile":
      // 9mobile SME format: *229*PIN*PlanCode*Phone#
      return `*229*${pin}*${planCode}*${normalized}#`;

    default:
      return `*461*1*${normalized}*${planCode}*${pin}#`;
  }
}

export function createSimJob(params: {
  reference: string;
  network: "mtn" | "airtel" | "glo" | "9mobile";
  phone: string;
  planId: string;
  planName: string;
  simSlot?: number;
  pin?: string;
}): SimDispenseJob {
  const pin = params.pin || process.env.PRIVATE_SIM_PIN || "1234";
  const ussdCommand = generateUssdCommand(params.network, params.planId, params.phone, pin);
  const job: SimDispenseJob = {
    id: `sim_job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    reference: params.reference,
    network: params.network,
    phone: params.phone,
    planId: params.planId,
    planName: params.planName,
    ussdCommand,
    simSlot: params.simSlot || 1,
    status: "queued",
    createdAt: new Date().toISOString(),
  };

  jobQueue.set(job.id, job);
  // Keep queue clean: remove completed jobs older than 1 hour
  if (jobQueue.size > 200) {
    const cutoff = Date.now() - 3600_000;
    for (const [id, j] of jobQueue.entries()) {
      if (j.status !== "queued" && new Date(j.createdAt).getTime() < cutoff) {
        jobQueue.delete(id);
      }
    }
  }

  return job;
}

export function getNextPendingJob(deviceId?: string): SimDispenseJob | null {
  for (const job of jobQueue.values()) {
    if (job.status === "queued") {
      job.status = "dispatched";
      job.dispatchedAt = new Date().toISOString();
      job.deviceId = deviceId;
      return job;
    }
  }
  return null;
}

export function reportJobResult(params: {
  jobId: string;
  status: "successful" | "failed";
  responseText: string;
  deviceId?: string;
}): SimDispenseJob | null {
  const job = jobQueue.get(params.jobId);
  if (!job) return null;

  job.status = params.status;
  job.responseText = params.responseText;
  job.completedAt = new Date().toISOString();
  if (params.deviceId) job.deviceId = params.deviceId;

  return job;
}

export function updateDeviceHeartbeat(status: {
  deviceId: string;
  deviceName?: string;
  batteryLevel?: number;
  isCharging?: boolean;
  signalStrength?: string;
  simSlot1Network?: string;
  simSlot2Network?: string;
}): SimDeviceStatus {
  const device: SimDeviceStatus = {
    deviceId: status.deviceId,
    deviceName: status.deviceName || "Funda Android Dispenser",
    batteryLevel: status.batteryLevel,
    isCharging: status.isCharging,
    signalStrength: status.signalStrength,
    simSlot1Network: status.simSlot1Network || "MTN",
    simSlot2Network: status.simSlot2Network,
    lastSeenAt: new Date().toISOString(),
    status: "online",
  };

  connectedDevices.set(status.deviceId, device);
  return device;
}

export function getGatewayHealth() {
  const now = Date.now();
  const devices = Array.from(connectedDevices.values()).map((d) => ({
    ...d,
    status: now - new Date(d.lastSeenAt).getTime() < 30_000 ? ("online" as const) : ("offline" as const),
  }));

  const pendingJobs = Array.from(jobQueue.values()).filter((j) => j.status === "queued" || j.status === "dispatched");
  const recentJobs = Array.from(jobQueue.values()).slice(-20).reverse();

  return {
    devices,
    onlineDevicesCount: devices.filter((d) => d.status === "online").length,
    pendingJobsCount: pendingJobs.length,
    recentJobs,
  };
}

export function getJobById(jobId: string): SimDispenseJob | null {
  return jobQueue.get(jobId) || null;
}

export function getJobByReference(reference: string): SimDispenseJob | null {
  for (const job of jobQueue.values()) {
    if (job.reference === reference) return job;
  }
  return null;
}
