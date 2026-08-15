import type { Metadata } from "next";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const metadata: Metadata = {
  title: "About Funda",
  description: "Learn about Funda - the minimalist everyday billing companion built for Nigeria.",
};

export default function AboutPage() {
  return <FundaExperience stories={stories} />;
}