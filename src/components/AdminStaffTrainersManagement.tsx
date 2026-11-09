import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IdentificationBadge, Users } from "@phosphor-icons/react";
import AdminStaffManagement from "./AdminStaffManagement";
import AdminTrainerManagement from "./AdminTrainerManagement";

export type StaffTrainerSubTab = "staff" | "trainers";

interface AdminStaffTrainersManagementProps {
  initialSubTab?: StaffTrainerSubTab;
  onSubTabChange?: (subTab: StaffTrainerSubTab) => void;
}

export default function AdminStaffTrainersManagement({
  initialSubTab = "staff",
  onSubTabChange,
}: AdminStaffTrainersManagementProps) {
  const [activeTab, setActiveTab] = useState<StaffTrainerSubTab>(initialSubTab);

  useEffect(() => {
    if (initialSubTab && initialSubTab !== activeTab) {
      setActiveTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleTabSwitch = (tab: StaffTrainerSubTab) => {
    setActiveTab(tab);
    onSubTabChange?.(tab);
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 p-1.5 bg-zinc-900 border border-zinc-800 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => handleTabSwitch("staff")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "staff"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <IdentificationBadge weight="fill" className="w-4 h-4" />
          <span>Staff Management</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabSwitch("trainers")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "trainers"
              ? "bg-lime-400 text-zinc-950 shadow-md shadow-lime-400/20"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
          }`}
        >
          <Users weight="fill" className="w-4 h-4" />
          <span>Trainers & PT</span>
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
          {activeTab === "staff" ? (
            <AdminStaffManagement />
          ) : (
            <AdminTrainerManagement />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

