import { cn } from "@/lib/utils";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "max-w-xl",
  md: "max-w-3xl",
  lg: "max-w-6xl",
};

export function Container({
  children,
  className,
  size = "lg",
}: ContainerProps) {
  return (
    <div className={cn("mx-auto px-4", sizeClasses[size], className)}>
      {children}
    </div>
  );
}
