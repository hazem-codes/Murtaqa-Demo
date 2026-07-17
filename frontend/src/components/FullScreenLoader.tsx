interface FullScreenLoaderProps {
  message?: string;
}

export function FullScreenLoader({ message = "جاري معالجة البيانات..." }: FullScreenLoaderProps) {
  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#F4F1EA]"
    >
      <div className="flex flex-col items-center gap-8">
        <div className="text-5xl md:text-6xl font-bold tracking-tight text-[#3D220A] animate-pulse">
          مُرتقى
        </div>

        <div className="h-1 w-48 overflow-hidden rounded-full bg-[#3D220A]/10">
          <div className="h-full w-1/2 rounded-full bg-[#D4AF37] animate-[loaderSlide_1.4s_ease-in-out_infinite]" />
        </div>

        <p className="text-sm font-medium text-[#3D220A]/60">{message}</p>
      </div>

      <style>{`
        @keyframes loaderSlide {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(240%); }
        }
      `}</style>
    </div>
  );
}
