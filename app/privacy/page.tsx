import type { Metadata } from "next";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const metadata: Metadata = {
  title: "Privacy Policy - Funda",
  description: "Funda Privacy Policy: how we collect, handle, and encrypt your personal data.",
};

export default function PrivacyPage() {
  return <FundaExperience stories={stories} />;
}
