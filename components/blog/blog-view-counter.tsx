"use client";

import { useEffect } from "react";

export default function BlogViewCounter({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;
    const storageKey = `funda_viewed_${slug}`;
    if (sessionStorage.getItem(storageKey)) return;

    sessionStorage.setItem(storageKey, "1");
    void fetch(`/api/blog/views/${slug}`, { method: "POST" }).catch(() => {});
  }, [slug]);

  return null;
}
