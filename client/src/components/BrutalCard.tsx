import { HTMLAttributes, ReactNode } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  tone?: "paper" | "pop" | "mint" | "sky" | "hot" | "bruise";
  tilt?: boolean;
  children: ReactNode;
}

const toneCls: Record<NonNullable<Props["tone"]>, string> = {
  paper: "bg-paper",
  pop: "bg-pop",
  mint: "bg-mint",
  sky: "bg-sky text-paper",
  hot: "bg-hot text-paper",
  bruise: "bg-bruise",
};

export function BrutalCard({
  tone = "paper", tilt, className = "", children, ...rest
}: Props) {
  return (
    <div
      className={`brut-card ${toneCls[tone]} p-4 ${tilt ? "-rotate-1" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
