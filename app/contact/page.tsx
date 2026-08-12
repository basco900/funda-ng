import type { Metadata } from "next";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const metadata: Metadata = {
  title: "Contact & Support - Funda",
  description: "Get 24/7 support for your Funda account, data delivery, meter tokens, or business inquiries.",
};

export default function ContactPage() {
  return <FundaExperience stories={stories} />;
}
