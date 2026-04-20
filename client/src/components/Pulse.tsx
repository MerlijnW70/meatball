/**
 * Flitst een CSS-puls op zijn children wanneer de meegegeven `value`
 * verandert. Gebruik: `<Pulse value={avg}>...</Pulse>`. Werkt realtime
 * mee met de SpacetimeDB subscription-updates.
 */
import { ReactNode, useEffect, useRef, useState } from "react";

interface Props {
  value: unknown;
  children: ReactNode;
  className?: string;
}

export function Pulse({ value, children, className = "" }: Props) {
  const [flash, setFlash] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span className={`inline-block ${flash ? "animate-[pulseflash_0.6s_ease-out]" : ""} ${className}`}>
      {children}
    </span>
  );
}
