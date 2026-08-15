import type { Metadata } from "next";
import FundaExperience from "./onboarding/funda-experience";
import { stories } from "./onboarding/stories";

export const metadata: Metadata = {
  title: "Life, funded",
  description: "Buy data, airtime and everyday essentials simply with Funda.",
};

export default function HomePage() {
  return <FundaExperience stories={stories} />;
}
