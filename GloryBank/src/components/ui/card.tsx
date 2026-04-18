interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
  noPadding?: boolean;
}

export function Card({
  children,
  className = "",
  onClick,
  hover = false,
  noPadding = false,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl overflow-hidden ${noPadding ? "" : "p-6"} ${hover ? "cursor-pointer transition-all duration-150 hover:border-indigo-500/30" : ""} ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`mb-4 ${className}`}>{children}</div>;
}

export function CardTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`text-[15px] font-semibold text-slate-800 ${className}`}>
      {children}
    </h3>
  );
}
