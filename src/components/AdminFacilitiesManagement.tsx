import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lockers, Drop } from "@phosphor-icons/react";
import LockersManagement from "./LockersManagement";
import SteamManagement from "./SteamManagement";

type FacilityTab = "lockers" | "steam";

export default function AdminFacilitiesManagement() {
  const [activeTab, setActiveTab] = useState<FacilityTab>("lockers");

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 p-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("lockers")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "lockers"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <Lockers weight="fill" className="w-4 h-4" />
          <span>Lockers</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("steam")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "steam"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <Drop weight="fill" className="w-4 h-4" />
          <span>Steam / Sauna</span>
        </button>
      </div>

      {/* Sub-tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === "lockers" ? (
            <LockersManagement canManage={false} />
          ) : (
            <SteamManagement isAdmin={true} canManageServices={false} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
