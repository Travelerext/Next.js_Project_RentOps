import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#16234a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "机械设备租赁管理系统",
  description: "机械设备租赁管理系统 - 订单、合同、设备、财务、维修一体化管理",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      style={{ colorScheme: "light dark" }}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('rentops-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}else{document.documentElement.removeAttribute('data-theme');document.documentElement.style.colorScheme='light dark'}}catch(e){}",
          }}
        />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
