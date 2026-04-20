import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "ink" | "hot" | "pop" | "mint" | "sky" | "paper";

const bg: Record<Variant, string> = {
  ink: "bg-ink text-paper",
  hot: "bg-hot text-paper",
  pop: "bg-pop text-ink",
  mint: "bg-mint text-ink",
  sky: "bg-sky text-paper",
  paper: "bg-paper text-ink",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  children: ReactNode;
}

export function BrutalButton({
  variant = "pop", size = "md", block, className = "", children, ...rest
}: Props) {
  const sz =
    size === "lg" ? "text-xl py-4 px-6" :
    size === "sm" ? "text-sm py-2 px-3" :
    "text-base py-3 px-5";
  return (
    <button
      className={`brut-btn ${bg[variant]} ${sz} ${block ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
