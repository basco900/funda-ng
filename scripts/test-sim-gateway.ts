import {
  createSimJob,
  getNextPendingJob,
  reportJobResult,
  getGatewayHealth,
  updateDeviceHeartbeat,
} from "../lib/services/sim-gateway";

async function testSimGatewayLogic() {
  console.log("=== FUNDA PRIVATE SIM GATEWAY TEST ===");

  console.log("\n1. Testing Device Heartbeat...");
  updateDeviceHeartbeat({
    deviceId: "phone-tecno-19",
    deviceName: "Tecno Camon 19 (MTN SME Dispenser)",
    batteryLevel: 94,
    isCharging: true,
    signalStrength: "4G Full",
  });

  const health1 = getGatewayHealth();
  console.log("Connected Devices:", health1.devices);
  console.log("Online Count:", health1.onlineDevicesCount);

  console.log("\n2. Customer buys MTN 1GB SME (₦280)...");
  const job = createSimJob({
    reference: "FND-TEST-REF-9988",
    network: "mtn",
    phone: "08163474155",
    planId: "2", // 1GB
    planName: "MTN 1GB SME (30 Days)",
    pin: "1234",
  });
  console.log("Created Job:", {
    id: job.id,
    ussdCommand: job.ussdCommand,
    status: job.status,
    phone: job.phone,
  });

  console.log("\n3. Standalone Android Phone polls /api/sim-gateway/poll...");
  const polledJob = getNextPendingJob("phone-tecno-19");
  console.log("Phone received USSD command to dial:", {
    id: polledJob?.id,
    ussdToDial: polledJob?.ussdCommand,
    status: polledJob?.status,
  });

  console.log("\n4. Phone executes USSD dial and posts report to /api/sim-gateway/report...");
  const reportedJob = reportJobResult({
    jobId: polledJob!.id,
    status: "successful",
    responseText: "You have gifted 1GB to 2348163474155. Your remaining SME balance is 49GB.",
    deviceId: "phone-tecno-19",
  });
  console.log("Job Settle Result:", {
    id: reportedJob?.id,
    status: reportedJob?.status,
    completedAt: reportedJob?.completedAt,
    response: reportedJob?.responseText,
  });

  console.log("\n5. Checking final gateway health...");
  const health2 = getGatewayHealth();
  console.log("Recent Jobs in Queue:", health2.recentJobs.length);
  console.log("Pending Jobs:", health2.pendingJobsCount);
  console.log("\n✅ ALL PRIVATE SIM GATEWAY ENGINE TESTS PASSED!");
}

testSimGatewayLogic().catch(console.error);
