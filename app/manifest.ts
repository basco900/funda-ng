import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Funda",
    short_name: "Funda",
    description: "Data, airtime and everyday essentials in one simple place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7f5",
    theme_color: "#18745a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
