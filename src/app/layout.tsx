import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MealNote｜10 秒记下这一餐",
  description: "面向中国饮食习惯与海外华人的极简 AI 饮食记录器。",
  applicationName: "MealNote",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MealNote",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ECFDF5",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
