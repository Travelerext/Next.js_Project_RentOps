"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AuthError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Auth route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
        <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          页面加载出错
        </h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {error.message || "发生了未知错误"}
        </p>
        <Button variant="outline" className="mt-4" onClick={reset}>
          重试
        </Button>
      </div>
    </div>
  );
}
