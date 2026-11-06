// Every service Funda offers or plans to offer, grouped for the "All services" sheet.
// `serviceId` links an entry to a live purchase flow; entries without one show as "Soon".

export type CatalogItem = {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  serviceId?: string;
};

export type CatalogCategory = {
  id: string;
  title: string;
  items: CatalogItem[];
};

export const SERVICE_CATALOG: CatalogCategory[] = [
  {
    id: "mobile",
    title: "Mobile & Internet",
    items: [
      { id: "data", name: "Data Bundles", subtitle: "MTN, Airtel, Glo, 9mobile", icon: "data", serviceId: "data" },
      { id: "airtime", name: "Airtime", subtitle: "Instant VTU top-up", icon: "airtime", serviceId: "airtime" },
      { id: "epin", name: "Recharge PINs", subtitle: "Printable e-PINs", icon: "ticket", serviceId: "airtime" },
      { id: "broadband", name: "Broadband", subtitle: "Spectranet, Smile, Swift", icon: "internet", serviceId: "internet" },
      { id: "airtime-cash", name: "Airtime to Cash", subtitle: "Convert spare airtime", icon: "refund" },
      { id: "intl-airtime", name: "International Airtime", subtitle: "Top up abroad", icon: "internet" },
      { id: "bulk-sms", name: "Bulk SMS", subtitle: "Send to many numbers", icon: "message" },
    ],
  },
  {
    id: "bills",
    title: "Bills & Utilities",
    items: [
      { id: "electricity", name: "Electricity", subtitle: "Prepaid & postpaid, all DisCos", icon: "bolt", serviceId: "electricity" },
      { id: "tv", name: "Cable TV", subtitle: "DStv, GOtv, StarTimes", icon: "tv", serviceId: "tv" },
      { id: "fibre", name: "Home Fibre", subtitle: "ipNX, FiberOne, Tizeti", icon: "internet" },
      { id: "water", name: "Water Bill", subtitle: "State water boards", icon: "droplet" },
      { id: "waste", name: "Waste Bill", subtitle: "LAWMA & PSP", icon: "trash" },
    ],
  },
  {
    id: "education",
    title: "Education",
    items: [
      { id: "waec", name: "WAEC", subtitle: "Result checker PIN", icon: "education", serviceId: "education" },
      { id: "neco", name: "NECO", subtitle: "Result token", icon: "education", serviceId: "education" },
      { id: "jamb", name: "JAMB", subtitle: "UTME & DE e-PIN", icon: "education", serviceId: "education" },
      { id: "nabteb", name: "NABTEB", subtitle: "Result checker", icon: "education" },
      { id: "school-fees", name: "School Fees", subtitle: "Pay schools directly", icon: "building" },
    ],
  },
  {
    id: "gaming",
    title: "Betting & Gaming",
    items: [
      { id: "betting", name: "Betting Wallet", subtitle: "SportyBet, Bet9ja, 1xBet", icon: "ticket", serviceId: "betting" },
      { id: "game-credits", name: "Game Credits", subtitle: "PUBG UC, Free Fire, CODM", icon: "gamepad" },
      { id: "console", name: "Console Cards", subtitle: "PlayStation, Xbox, Steam", icon: "gamepad" },
    ],
  },
  {
    id: "giftcards",
    title: "Gift Cards & Subscriptions",
    items: [
      { id: "gift-cards", name: "Gift Cards", subtitle: "Amazon, Apple, Google Play", icon: "gift" },
      { id: "streaming", name: "Streaming", subtitle: "Netflix, Showmax, Prime", icon: "play" },
      { id: "music", name: "Music", subtitle: "Spotify, Apple Music", icon: "play" },
      { id: "software", name: "Software", subtitle: "Microsoft 365, Canva", icon: "grid" },
    ],
  },
  {
    id: "travel",
    title: "Transport & Travel",
    items: [
      { id: "flights", name: "Flights", subtitle: "Local & international", icon: "plane" },
      { id: "bus", name: "Bus Tickets", subtitle: "Interstate travel", icon: "car" },
      { id: "toll", name: "Toll & e-Tag", subtitle: "Lekki, LCC top-up", icon: "car" },
      { id: "vehicle-papers", name: "Vehicle Papers", subtitle: "Licence & renewals", icon: "card" },
    ],
  },
  {
    id: "government",
    title: "Government & Taxes",
    items: [
      { id: "remita", name: "Remita", subtitle: "Federal payments", icon: "building" },
      { id: "tax", name: "Taxes", subtitle: "FIRS & state revenue", icon: "building" },
      { id: "id-services", name: "ID Services", subtitle: "NIN slip, passport fees", icon: "user" },
    ],
  },
  {
    id: "money",
    title: "Money & Finance",
    items: [
      { id: "transfer", name: "Bank Transfer", subtitle: "Send to any bank", icon: "send" },
      { id: "pay-user", name: "Pay a Funda User", subtitle: "Free, instant", icon: "user" },
      { id: "virtual-card", name: "Virtual Dollar Card", subtitle: "Pay online abroad", icon: "card" },
      { id: "savings", name: "Savings", subtitle: "Lock & earn", icon: "wallet" },
    ],
  },
  {
    id: "insurance",
    title: "Insurance",
    items: [
      { id: "motor", name: "Motor Insurance", subtitle: "Third-party cover", icon: "car" },
      { id: "health", name: "Health Plans", subtitle: "HMO cover", icon: "heart" },
      { id: "device", name: "Device Cover", subtitle: "Phones & laptops", icon: "shield" },
    ],
  },
];
