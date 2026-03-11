import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/config";

const BUILD_DATE = new Date("2026-03-11");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: BUILD_DATE,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/tailor`,
      lastModified: BUILD_DATE,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];
}
