import { testWallet } from "@/lib/test-engine/wallet";

export async function GET() {
  return Response.json({ balance: testWallet.balance });
}
