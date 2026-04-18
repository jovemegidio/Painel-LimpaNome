export function Loading({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-3",
    lg: "h-12 w-12 border-4",
  };

  return (
    <div className="flex items-center justify-center">
      <div
        className={`${sizeClasses[size]} animate-spin rounded-full border-indigo-500 border-t-transparent`}
      />
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <Loading size="lg" />
        <p className="mt-4 text-sm text-slate-500">Carregando...</p>
      </div>
    </div>
  );
}

const pulse = "animate-pulse rounded-xl bg-black/[0.04]";

export function SkeletonBalanceCard() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6"
      style={{
        background: "linear-gradient(135deg,#eef2ff 0%,#c7d2fe 50%,#a5b4fc 100%)",
        border: "1px solid rgba(99,102,241,0.1)",
      }}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className={`${pulse} h-8 w-8`} />
          <div className={`${pulse} h-3.5 w-28`} />
        </div>
        <div className={`${pulse} h-7 w-7`} />
      </div>
      <div className={`${pulse} h-9 w-48 mb-8`} />
      <div className="flex gap-8">
        <div className="flex items-center gap-3">
          <div className={`${pulse} h-8 w-8`} />
          <div className="space-y-1.5">
            <div className={`${pulse} h-2.5 w-16`} />
            <div className={`${pulse} h-3.5 w-20`} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`${pulse} h-8 w-8`} />
          <div className="space-y-1.5">
            <div className={`${pulse} h-2.5 w-16`} />
            <div className={`${pulse} h-3.5 w-20`} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonTransactions() {
  return (
    <div className="space-y-1 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between rounded-xl px-3 py-3">
          <div className="flex items-center gap-3">
            <div className={`${pulse} h-9 w-9`} />
            <div className="space-y-1.5">
              <div className={`${pulse} h-3 w-28`} />
              <div className={`${pulse} h-2.5 w-20`} />
            </div>
          </div>
          <div className="text-right space-y-1.5">
            <div className={`${pulse} h-3 w-20 ml-auto`} />
            <div className={`${pulse} h-2.5 w-14 ml-auto`} />
          </div>
        </div>
      ))}
    </div>
  );
}
