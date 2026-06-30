import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center bg-app-bg">
        <div className="text-sm text-app-muted">加载中...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}


