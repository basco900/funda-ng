export type StoryVisual = "signal" | "cashback" | "services" | "home";

export type StoryDefinition = {
  id: string;
  headline: string;
  body: string;
  artwork: string;
  artworkAlt: string;
  visual: StoryVisual;
};

export type AuthPreviewMode = "login" | "register";

export type AuthPreviewStep = "identifier" | "otp" | "profile" | "complete";

export const stories: StoryDefinition[] = [
  {
    id: "less-spend",
    headline: "More data.\nLess money.",
    body: "Affordable bundles for every network, whenever you need them.",
    artwork: "/onboarding/funda-sim.webp",
    artworkAlt: "A sculpted black SIM card with a bright signal light",
    visual: "signal",
  },
  {
    id: "airtime",
    headline: "Recharge.\nJust like that.",
    body: "Top up any Nigerian line in seconds and get on with your day.",
    artwork: "/onboarding/funda-cashback.webp",
    artworkAlt: "A graphite recharge case releasing a bright airtime token",
    visual: "cashback",
  },
  {
    id: "electricity",
    headline: "Lights on.\nStress off.",
    body: "Pay your electricity bill from anywhere—no queues, no fuss.",
    artwork: "/onboarding/funda-services.webp",
    artworkAlt: "Connected electricity symbols orbiting a central payment hub",
    visual: "services",
  },
  {
    id: "better-value",
    headline: "Why pay\nmore?",
    body: "Do more for less with better prices across your everyday bills.",
    artwork: "/onboarding/funda-home.webp",
    artworkAlt: "A calm Funda payment interface surrounded by everyday utilities",
    visual: "home",
  },
];
