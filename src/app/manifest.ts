import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MealNote｜极简中餐饮食记录",
    short_name: "MealNote",
    description: "用照片、语音或文字，在约 10 秒内记下一餐。",
    start_url: "/",
    display: "standalone",
    background_color: "#ECFDF5",
    theme_color: "#059669",
    lang: "zh-CN",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
