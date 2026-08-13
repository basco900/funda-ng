import type { Metadata } from "next";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your secure Funda account.",
};

export default function RegisterPage() {
  return <FundaExperience stories={stories} />;
}
