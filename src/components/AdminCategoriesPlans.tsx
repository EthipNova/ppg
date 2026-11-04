import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tag, Sparkle } from "@phosphor-icons/react";
import { CategoriesView } from "./CategoryManagement";
import { PlansView } from "./PlansView";

type SubTab = "categories" | "plans";

export default function AdminCategoriesPlans() {
  const [activeTab, setActiveTab] = useState<SubTab>("categories");

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 p-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("categories")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "categories"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <Tag weight="fill" className="w-4 h-4" />
          <span>Categories</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("plans")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "plans"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <Sparkle weight="fill" className="w-4 h-4" />
          <span>Membership Plans</span>
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
          {activeTab === "categories" ? <CategoriesView /> : <PlansView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
