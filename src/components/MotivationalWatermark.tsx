import { memo } from "react";

interface MotivationalWatermarkProps {
  phrases: string[];
  opacity?: string;
  className?: string;
}

function MotivationalWatermarkComponent({
  phrases,
  opacity = "opacity-[0.035]",
  className = "",
}: MotivationalWatermarkProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none overflow-hidden absolute inset-0 z-0 flex flex-col justify-around py-12 ${className}`}
    >
      {phrases.map((phrase, idx) => {
        // Alternate alignment and slight rotations for dynamic athletic wall feel
        const isEven = idx % 2 === 0;
        const align = isEven ? "justify-start -ml-6" : "justify-end -mr-6";
        return (
          <div
            key={`${phrase}-${idx}`}
            className={`flex ${align} w-full leading-none whitespace-nowrap`}
          >
            <span
              className={`font-black uppercase tracking-tighter text-white ${opacity} text-6xl sm:text-8xl lg:text-9xl transform ${
                isEven ? "-rotate-1" : "rotate-1"
              }`}
            >
              {phrase}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const MotivationalWatermark = memo(MotivationalWatermarkComponent);
export default MotivationalWatermark;
