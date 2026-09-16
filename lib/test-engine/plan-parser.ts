export function dataAmountMbFromName(name: string): number | null {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2].toUpperCase();
  return unit === "TB" ? amount * 1_000_000 : unit === "GB" ? amount * 1_000 : amount;
}

export function parsePlanValidity(
  name: string,
  explicitValidity?: string | null
): { label: string | null; hours: number | null } {
  const combined = `${explicitValidity || ""} ${name || ""}`.trim();
  if (!combined) return { label: null, hours: null };

  const text = combined.toLowerCase();

  // 1. Special duration keyword checks
  if (/\b(night|midnight)\b/i.test(text)) {
    return { label: "Night Plan (11PM - 6AM)", hours: 7 };
  }
  if (/\bweekend\b/i.test(text)) {
    return { label: "Weekend", hours: 48 };
  }
  if (/\b(yearly|annual|1\s*year|12\s*months?|365\s*days?)\b/i.test(text)) {
    return { label: "1 Year", hours: 24 * 365 };
  }
  if (/\b(6\s*months?|6-month|bi-annual|180\s*days?)\b/i.test(text)) {
    return { label: "6 Months", hours: 24 * 180 };
  }
  if (/\b(3\s*months?|3-month|quarterly|90\s*days?)\b/i.test(text)) {
    return { label: "3 Months", hours: 24 * 90 };
  }
  if (/\b(2\s*months?|2-month|60\s*days?)\b/i.test(text)) {
    return { label: "2 Months", hours: 24 * 60 };
  }
  if (/\b(monthly|1\s*month|1-month|30\s*days?|30-day|30days)\b/i.test(text)) {
    return { label: "30 Days", hours: 24 * 30 };
  }
  if (/\b(2\s*weeks?|2-week|14\s*days?|14-day|14days)\b/i.test(text)) {
    return { label: "14 Days", hours: 24 * 14 };
  }
  if (/\b(weekly|1\s*week|1-week|7\s*days?|7-day|7days)\b/i.test(text)) {
    return { label: "7 Days", hours: 24 * 7 };
  }
  if (/\b(5\s*days?|5-day|5days)\b/i.test(text)) {
    return { label: "5 Days", hours: 24 * 5 };
  }
  if (/\b(3\s*days?|3-day|3days|72\s*hours?|72hrs?)\b/i.test(text)) {
    return { label: "3 Days", hours: 24 * 3 };
  }
  if (/\b(2\s*days?|2-day|2days|48\s*hours?|48hrs?)\b/i.test(text)) {
    return { label: "2 Days", hours: 24 * 2 };
  }
  if (/\b(daily|1\s*day|1-day|1day|24\s*hours?|24hrs?|24-hour)\b/i.test(text)) {
    return { label: "1 Day", hours: 24 };
  }
  if (/\b(12\s*hours?|12hrs?|12-hour)\b/i.test(text)) {
    return { label: "12 Hours", hours: 12 };
  }
  if (/\b(6\s*hours?|6hrs?|6-hour)\b/i.test(text)) {
    return { label: "6 Hours", hours: 6 };
  }
  if (/\b(3\s*hours?|3hrs?|3-hour)\b/i.test(text)) {
    return { label: "3 Hours", hours: 3 };
  }
  if (/\b(1\s*hour|1hr|1-hour)\b/i.test(text)) {
    return { label: "1 Hour", hours: 1 };
  }

  // 2. Generic regex match for any "X days", "X months", "X weeks", "X hours"
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*[-]?\s*(day|days|week|weeks|month|months|year|years|hour|hours|hr|hrs)\b/i);
  if (match) {
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unit.startsWith("hr") || unit.startsWith("hour")
      ? 1
      : unit.startsWith("day")
      ? 24
      : unit.startsWith("week")
      ? 24 * 7
      : unit.startsWith("month")
      ? 24 * 30
      : 24 * 365;
    const baseUnit = unit.startsWith("hr") || unit.startsWith("hour")
      ? (value === 1 ? "Hour" : "Hours")
      : unit.startsWith("day")
      ? (value === 1 ? "Day" : "Days")
      : unit.startsWith("week")
      ? (value === 1 ? "Week" : "Weeks")
      : unit.startsWith("month")
      ? (value === 1 ? "Month" : "Months")
      : (value === 1 ? "Year" : "Years");
    const label = `${value} ${baseUnit}`;
    return { label, hours: Number.isFinite(value) ? Math.round(value * multiplier) : null };
  }

  return { label: null, hours: null };
}

export function inferCategoryFromValidity(
  validityLabel: string | null,
  validityHours: number | null,
  availableCategories: { slug: string; name: string }[]
): string {
  if (!availableCategories.length) return "";
  const label = (validityLabel || "").toLowerCase();
  const hours = validityHours ?? 0;

  if (hours > 0) {
    if (hours <= 48) {
      const match = availableCategories.find((c) => /daily|day|24h/i.test(c.slug) || /daily|day/i.test(c.name));
      if (match) return match.slug;
    }
    if (hours > 48 && hours <= 14 * 24) {
      const match = availableCategories.find((c) => /weekly|week|7day/i.test(c.slug) || /weekly|week/i.test(c.name));
      if (match) return match.slug;
    }
    if (hours > 14 * 24 && hours <= 60 * 24) {
      const match = availableCategories.find((c) => /monthly|month|30day/i.test(c.slug) || /monthly|month/i.test(c.name));
      if (match) return match.slug;
    }
    if (hours > 60 * 24) {
      const match = availableCategories.find((c) => /mega|annual|yearly|multi-month|quarterly|monthly/i.test(c.slug) || /mega|annual|yearly|monthly/i.test(c.name));
      if (match) return match.slug;
    }
  }

  if (label) {
    if (/day|daily|hour/i.test(label)) {
      const match = availableCategories.find((c) => /daily|day/i.test(c.slug) || /daily|day/i.test(c.name));
      if (match) return match.slug;
    }
    if (/week/i.test(label)) {
      const match = availableCategories.find((c) => /weekly|week/i.test(c.slug) || /weekly|week/i.test(c.name));
      if (match) return match.slug;
    }
    if (/month/i.test(label)) {
      const match = availableCategories.find((c) => /monthly|month/i.test(c.slug) || /monthly|month/i.test(c.name));
      if (match) return match.slug;
    }
  }

  return availableCategories[0]?.slug || "";
}
