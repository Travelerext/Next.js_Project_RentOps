"use client";

import { useActionState } from "react";
import { updateProfile } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { User, Loader2, CheckCircle } from "lucide-react";
import type { ProfileData } from "./page";

export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [state, action, pending] = useActionState(updateProfile, null);

  return (
    <div className="max-w-lg">
      <Card>
        <form action={action} className="p-6 space-y-5">
          {/* Avatar / header */}
          <div className="flex items-center gap-3 pb-4 border-b border-zinc-200 dark:border-zinc-700">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {profile.display_name}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {profile.primary_role ?? "未分配角色"}
              </p>
            </div>
          </div>

          {/* Username (read-only) */}
          <Input
            id="username"
            label="用户名"
            value={profile.username ?? ""}
            disabled
          />

          {/* Display name */}
          <Input
            id="display_name"
            name="display_name"
            label="显示名称"
            defaultValue={profile.display_name ?? ""}
            placeholder="您的显示名称"
            required
          />

          {/* Real name */}
          <Input
            id="real_name"
            name="real_name"
            label="真实姓名"
            defaultValue={profile.real_name ?? ""}
            placeholder="您的真实姓名（选填）"
          />

          {/* Phone */}
          <Input
            id="phone"
            name="phone"
            label="手机号码"
            type="tel"
            defaultValue={profile.phone ?? ""}
            placeholder="您的手机号码（选填）"
          />

          {/* Email */}
          <Input
            id="email"
            name="email"
            label="邮箱"
            type="email"
            defaultValue={profile.email ?? ""}
            placeholder="your@email.com"
          />

          {/* Employee no (read-only) */}
          {profile.employee_no && (
            <Input
              id="employee_no"
              label="员工编号"
              value={profile.employee_no}
              disabled
            />
          )}

          {/* Feedback */}
          {state?.error && (
            <div
              className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 animate-fade-in"
              role="alert"
            >
              {state.error}
            </div>
          )}
          {state?.success && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 animate-fade-in flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              {state.message ?? "保存成功"}
            </div>
          )}

          {/* Submit */}
          <div className="pt-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  保存中…
                </>
              ) : (
                "保存修改"
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
