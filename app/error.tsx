"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Root error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
        <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          系统暂时不可用
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {error.message || "服务器发生错误，请稍后重试"}
        </p>
        <Button variant="outline" className="mt-4" onClick={reset}>
          重试
        </Button>
      </div>
    </div>
  );
}
