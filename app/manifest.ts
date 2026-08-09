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
    background_color: "#111313",
    theme_color: "#111313",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
