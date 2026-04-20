import { InputHTMLAttributes, forwardRef } from "react";

export const BrutalInput = forwardRef<
  HTMLInputElement, InputHTMLAttributes<HTMLInputElement>
>(function BrutalInput({ className = "", ...rest }, ref) {
  return <input ref={ref} className={`brut-input ${className}`} {...rest} />;
});
