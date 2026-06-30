import Image from "next/image";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
}

export function BrandLogo({
  size = 40,
  className,
  priority = false,
  alt = "RentOps",
}: BrandLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-[22%] bg-app-primary shadow-[0_10px_24px_color-mix(in_srgb,var(--brand-primary)_20%,transparent)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand-logo.png"
        alt={alt}
        width={size}
        height={size}
        priority={priority}
        unoptimized
        className="h-full w-full scale-[1.03] object-cover"
      />
    </span>
  );
}
