import type { Metadata } from "next";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const metadata: Metadata = {
  title: "Policies & Security - Funda",
  description: "Review Funda's privacy policy, terms of service, and automated refund guarantee.",
};

export default function PoliciesPage() {
  return <FundaExperience stories={stories} />;
}
