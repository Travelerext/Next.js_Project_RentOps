import { ViewTransition } from "react";
import { SkeletonPage } from "@/components/ui/skeleton";

/**
 * Loading skeleton with View Transition exit animation.
 * When the page data loads, the skeleton slides down and the content slides up.
 *
 * Per View Transitions skill: loading.tsx is an implicit <Suspense> boundary.
 * Wrap skeleton in <ViewTransition exit="..."> and content in page with
 * <ViewTransition enter="..." default="none">.
 */
export default function AuthLoading() {
  return (
    <ViewTransition exit="slide-down">
      <div className="p-4 md:p-6">
        <SkeletonPage />
      </div>
    </ViewTransition>
  );
}
