import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-zinc-300 dark:text-zinc-600">
          404
        </h1>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          页面未找到
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          您访问的页面不存在或已被移除
        </p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="primary">返回首页</Button>
        </Link>
      </div>
    </div>
  );
}
