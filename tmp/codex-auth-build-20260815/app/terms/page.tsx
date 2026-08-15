import type { Metadata } from "next";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const metadata: Metadata = {
  title: "Terms of Service - Funda",
  description: "Funda Terms of Service: account guidelines, service terms, and transaction rules.",
};

export default function TermsPage() {
  return <FundaExperience stories={stories} />;
}
