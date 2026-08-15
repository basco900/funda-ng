import type { Metadata } from "next";
import TestConsole from "./test-console";

export const metadata: Metadata = {
  title: "Core engine test · Orbit",
  description: "Test Flutterwave payments and multi-vendor VTU fulfilment.",
};

export default function TestPage() {
  return <TestConsole />;
}
