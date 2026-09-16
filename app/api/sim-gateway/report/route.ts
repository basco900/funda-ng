import { reportJobResult, updateDeviceHeartbeat } from "@/lib/services/sim-gateway";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const jobId = String(body.job_id || body.jobId || "");
    const status = body.status === "successful" || body.status === "success" ? "successful" : "failed";
    const responseText = String(body.response_text || body.responseText || body.message || "USSD executed.");
    const deviceId = String(body.device_id || body.deviceId || "android-dispenser-1");

    if (!jobId) {
      return Response.json({ error: "Missing job_id." }, { status: 400 });
    }

    // 1. Report to in-memory SIM Gateway Queue
    const job = reportJobResult({
      jobId,
      status,
      responseText,
      deviceId,
    });

    if (!job) {
      return Response.json({ error: "Job not found or already completed." }, { status: 404 });
    }

    // 2. Update device heartbeat if metadata sent
    updateDeviceHeartbeat({
      deviceId,
      batteryLevel: body.battery_level ? Number(body.battery_level) : undefined,
      isCharging: body.is_charging === true,
      signalStrength: body.signal_strength ? String(body.signal_strength) : undefined,
    });

    // 3. Settle transaction in Supabase if linked to a reference
    if (job.reference) {
      try {
        const adminClient = createAdminClient();
        if (adminClient) {
          await adminClient.rpc("customer_settle_service_purchase", {
            p_reference: job.reference,
            p_status: status,
            p_provider_reference: job.id,
            p_message: responseText,
            p_raw: {
              job_id: job.id,
              device_id: deviceId,
              response_text: responseText,
              ussd_command: job.ussdCommand,
            },
          });
        }
      } catch (dbErr) {
        console.error("[SIM Gateway] Error settling transaction in DB:", dbErr);
      }
    }

    return Response.json({
      status: "acknowledged",
      job_id: job.id,
      settled_status: status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Failed to process report.",
    }, { status: 500 });
  }
}
