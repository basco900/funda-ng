import type { Metadata } from "next";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const metadata: Metadata = {
  title: "Services & Products - Funda",
  description: "Explore Funda's billing services: Mobile Data Bundles, Airtime Top-Up, Electricity Tokens, and Cable TV Subscriptions.",
};

export default function ServicesPage() {
  return <FundaExperience stories={stories} />;
}
