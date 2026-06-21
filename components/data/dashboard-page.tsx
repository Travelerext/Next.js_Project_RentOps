import { ViewTransition } from "react";
import { DirectionalTransition } from "@/components/layout/directional-transition";
import { PageHeader } from "@/components/layout/page-header";
import type { ReactNode } from "react";

export function DashboardPage({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <DirectionalTransition>
      <ViewTransition enter="slide-up" default="none">
        <div className="space-y-6">
          <PageHeader title={title} subtitle={subtitle} actions={actions} />
          {children}
        </div>
      </ViewTransition>
    </DirectionalTransition>
  );
}
