import type { DiscoveredTV } from "@/lib/types";

interface TvCardProps {
  tv: DiscoveredTV;
  onSelect: (tv: DiscoveredTV) => void;
}

export default function TvCard({ tv, onSelect }: TvCardProps) {
  return (
    <button
      onClick={() => onSelect(tv)}
      className="w-full text-left rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-400 hover:shadow-md transition-all group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* TV icon */}
          <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
            <svg
              className="w-7 h-7 text-slate-500 group-hover:text-blue-600 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z"
              />
            </svg>
          </div>

          <div>
            <p className="font-medium text-slate-900">{tv.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {tv.modelYear > 0 && (
                <span className="text-xs text-slate-500">{tv.modelYear}</span>
              )}
              {tv.frameSupported && (
                <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md font-medium">
                  Frame TV
                </span>
              )}
              <span className="text-xs text-slate-400">
                via {tv.discoveredVia === "manual" ? "manual entry" : tv.discoveredVia.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <svg
          className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.25 4.5l7.5 7.5-7.5 7.5"
          />
        </svg>
      </div>
    </button>
  );
}
