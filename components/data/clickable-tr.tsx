"use client";

import { useRouter } from "next/navigation";
import { Tr } from "@/components/ui/table";
import type { ReactNode, MouseEvent } from "react";

interface ClickableTrProps {
  href?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

/** A thin client wrapper around <Tr> that handles navigation on row click. */
export function ClickableTr({ href, onClick, className, children }: ClickableTrProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (href) {
      router.push(href);
    }
  };

  return (
    <Tr
      className={className}
      onClick={handleClick}
    >
      {children}
    </Tr>
  );
}
