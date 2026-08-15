import type { Metadata } from "next";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const metadata: Metadata = {
  title: "Frequently Asked Questions - Funda",
  description: "Quick answers to common questions about buying data, airtime, and utility tokens on Funda.",
};

export default function FaqPage() {
  return <FundaExperience stories={stories} />;
}
