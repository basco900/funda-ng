import type { Metadata } from "next";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const metadata: Metadata = {
  title: "Log in",
  description: "Preview the Funda phone login experience.",
};

export default function LoginPage() {
  return <FundaExperience stories={stories} />;
}
