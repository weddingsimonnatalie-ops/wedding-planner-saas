interface AnimatedCardProps {
  children: React.ReactNode;
  staggerIndex?: number;
  className?: string;
}

export function AnimatedCard({
  children,
  staggerIndex = 1,
  className = "",
}: AnimatedCardProps) {
  const staggerClass = `stagger-${Math.min(staggerIndex, 6)}`;

  return (
    <div className={`animate-fade-in-up ${staggerClass} ${className}`}>
      {children}
    </div>
  );
}