import type { Metadata } from "next";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const metadata: Metadata = {
  title: "Refund Guarantee - Funda",
  description: "Funda Refund Guarantee: automated instant reversals for failed provider transactions.",
};

export default function RefundsPage() {
  return <FundaExperience stories={stories} />;
}
