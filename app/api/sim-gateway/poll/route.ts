import { getNextPendingJob, updateDeviceHeartbeat } from "@/lib/services/sim-gateway";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("device_id") || request.headers.get("x-device-id") || "android-dispenser-1";
  const deviceName = url.searchParams.get("device_name") || "Android Dispensing Phone";
  const batteryLevel = Number(url.searchParams.get("battery")) || undefined;
  const isCharging = url.searchParams.get("charging") === "true";
  const signalStrength = url.searchParams.get("signal") || undefined;

  // Update heartbeat
  updateDeviceHeartbeat({
    deviceId,
    deviceName,
    batteryLevel,
    isCharging,
    signalStrength,
  });

  // Check for next pending job
  const job = getNextPendingJob(deviceId);

  if (!job) {
    return Response.json({
      status: "idle",
      has_job: false,
      job: null,
      timestamp: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return Response.json({
    status: "active",
    has_job: true,
    job: {
      id: job.id,
      reference: job.reference,
      network: job.network,
      phone: job.phone,
      plan_id: job.planId,
      plan_name: job.planName,
      ussd_command: job.ussdCommand,
      sim_slot: job.simSlot,
      created_at: job.createdAt,
    },
    timestamp: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
