import type { Metadata } from "next";
import FundaExperience from "../onboarding/funda-experience";
import { stories } from "../onboarding/stories";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in securely with your email, phone, password or a one-time code.",
};

export default function LoginPage() {
  return <FundaExperience stories={stories} />;
}
