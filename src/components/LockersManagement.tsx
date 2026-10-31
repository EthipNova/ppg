import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lockers,
  Key,
  KeyReturn,
  Plus,
  MagnifyingGlass,
  Check,
  Warning,
  XCircle,
  X,
  ArrowsClockwise,
  User,
  ShieldCheck,
  GenderMale,
  GenderFemale,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useGym, useT } from "../context/GymContext";
import type { Locker, LockerAssignment } from "../types";
import { useLockers } from "../hooks/use-lockers";
import {
  assignLocker,
  addLocker,
  updateLocker,
  deleteLocker,
  returnLockerAssignment,
  searchCustomersForLocker,
  setLockerCondition,
  validateLockerRoomEligibility,
  type LockerCustomerOption,
} from "../services/lockers";

type RoomTab = "MEN" | "WOMEN";

const inputClass =
  "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-lime-400/60 transition-colors";
const labelClass = "text-xs font-bold uppercase tracking-wide text-zinc-500 mb-1.5 block";

export default function LockersManagement({ canManage = true }: { canManage?: boolean }) {
  const { state } = useGym();
  const t = useT();
  const lockerData = useLockers();
  const actor = state.currentUser?.name ?? "Reception";

  const [activeRoom, setActiveRoom] = useState<RoomTab>("MEN");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "AVAILABLE" | "OCCUPIED">("ALL");
  const [historyRoomFilter, setHistoryRoomFilter] = useState<"ALL" | "MEN" | "WOMEN">("ALL");
  const [selectedLocker, setSelectedLocker] = useState<Locker | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingLocker, setEditingLocker] = useState<Locker | null>(null);

  // Active assignment map by locker ID
  const activeAssignmentMap = useMemo(() => {
    const map = new Map<string, LockerAssignment>();
    for (const a of lockerData.assignments) {
      if (a.status === "active" && !map.has(a.lockerId)) {
        map.set(a.lockerId, a);
      }
    }
    return map;
  }, [lockerData.assignments]);

  // Separate lockers by room
  const menLockers = useMemo(() => {
    return lockerData.lockers.filter(l => {
      const loc = (l.section || "").toLowerCase();
      return loc.includes("men") && !loc.includes("women");
    });
  }, [lockerData.lockers]);

  const womenLockers = useMemo(() => {
    return lockerData.lockers.filter(l => {
      const loc = (l.section || "").toLowerCase();
      return loc.includes("women");
    });
  }, [lockerData.lockers]);

  // Current tab inventory
  const currentRoomLockers = activeRoom === "MEN" ? menLockers : womenLockers;

  const handleDeleteLocker = async (locker: Locker) => {
    const isOccupied =
      locker.status === "OCCUPIED" ||
      locker.status === "IN_USE" ||
      activeAssignmentMap.has(locker.id);

    if (isOccupied) {
      toast.error(`Cannot delete locker ${locker.number}: it is currently occupied. Please return the locker first.`);
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete locker ${locker.number}? If this locker has past assignment records, it will be safely archived to preserve history.`
    );
    if (!confirmed) return;

    try {
      await deleteLocker(locker.id);
      await lockerData.refresh();
      if (selectedLocker?.id === locker.id) {
        setSelectedLocker(null);
      }
      toast.success(`Locker ${locker.number} removed from inventory.`);
    } catch (cause) {
      console.error("Failed to delete locker:", cause);
      toast.error(cause instanceof Error ? cause.message : "Failed to delete locker.");
    }
  };

  // Filtered inventory based on search and status
  const visibleLockers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return currentRoomLockers
      .filter(l => {
        const isOccupied = l.status === "OCCUPIED" || l.status === "IN_USE" || activeAssignmentMap.has(l.id);
        if (statusFilter === "AVAILABLE") return !isOccupied && l.status === "AVAILABLE" && l.isActive !== false;
        if (statusFilter === "OCCUPIED") return isOccupied;
        return true;
      })
      .filter(l => {
        if (!q) return true;
        const assignment = activeAssignmentMap.get(l.id);
        const occupant = assignment?.memberName ?? "";
        return (
          l.number.toLowerCase().includes(q) ||
          l.keyTag.toLowerCase().includes(q) ||
          occupant.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  }, [currentRoomLockers, search, statusFilter, activeAssignmentMap]);

  // Stats for current room
  const roomStats = useMemo(() => {
    const total = currentRoomLockers.length;
    const occupied = currentRoomLockers.filter(
      l => l.status === "OCCUPIED" || l.status === "IN_USE" || activeAssignmentMap.has(l.id)
    ).length;
    const available = currentRoomLockers.filter(
      l => l.status === "AVAILABLE" && !activeAssignmentMap.has(l.id) && l.isActive !== false
    ).length;
    return { total, occupied, available };
  }, [currentRoomLockers, activeAssignmentMap]);

  // Gym-wide aggregate stats
  const gymStats = useMemo(() => {
    const total = lockerData.lockers.length;
    const occupied = lockerData.lockers.filter(
      l => l.status === "OCCUPIED" || l.status === "IN_USE" || activeAssignmentMap.has(l.id)
    ).length;
    const available = lockerData.lockers.filter(
      l => (l.status === "AVAILABLE" || !l.status) && l.isActive !== false && !activeAssignmentMap.has(l.id)
    ).length;
    const maintenance = Math.max(0, total - occupied - available);
    return { total, occupied, available, maintenance };
  }, [lockerData.lockers, activeAssignmentMap]);

  // Assignment & release activity history relevant to filter
  const history = useMemo(() => {
    return lockerData.assignments
      .filter(a => {
        if (historyRoomFilter === "ALL") return true;
        const locker = lockerData.lockers.find(l => l.id === a.lockerId);
        const loc = (locker?.section || "").toLowerCase();
        if (historyRoomFilter === "MEN") return loc.includes("men") && !loc.includes("women");
        if (historyRoomFilter === "WOMEN") return loc.includes("women");
        return true;
      })
      .slice()
      .sort((a, b) => (a.assignedAt < b.assignedAt ? 1 : -1));
  }, [lockerData.assignments, lockerData.lockers, historyRoomFilter]);

  return (
    <div className="space-y-6">
      {/* Top Banner and Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-lime-400/15 rounded-2xl flex items-center justify-center border border-lime-400/20">
            <Lockers weight="fill" className="w-6 h-6 text-lime-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-white">
              {canManage ? t("locker.title") : "Locker Operations Monitoring"}
            </h2>
            <p className="text-sm text-zinc-400">
              {canManage
                ? "Visual physical locker inventory, room assignment, and key returns"
                : "Real-time monitoring of gym locker inventory, occupant details, and key assignment/release activity."}
            </p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAdd(true)}
            className="bg-lime-400 text-zinc-950 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-lime-300 transition-colors active:scale-[0.97] flex items-center gap-2"
          >
            <Plus weight="bold" className="w-4 h-4" /> Add Lockers
          </button>
        )}
      </div>

      {/* Gym-Wide Locker Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Total Lockers</div>
          <div className="mt-1 text-2xl font-black text-white">{gymStats.total}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Physical units in gym</div>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Available Lockers</div>
          <div className="mt-1 text-2xl font-black text-emerald-300">{gymStats.available}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Ready for assignment</div>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Occupied Lockers</div>
          <div className="mt-1 text-2xl font-black text-amber-300">{gymStats.occupied}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Key currently issued</div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Maintenance / Inactive</div>
          <div className="mt-1 text-2xl font-black text-zinc-300">{gymStats.maintenance}</div>
          <div className="text-xs text-zinc-500 mt-0.5">Under repair or inactive</div>
        </div>
      </div>

      {lockerData.error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          <span>{lockerData.error}</span>
          <button onClick={() => void lockerData.refresh()} className="font-semibold text-red-300 hover:text-white">
            Retry
          </button>
        </div>
      )}

      {/* Men's vs Women's Locker Room Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveRoom("MEN")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
              activeRoom === "MEN"
                ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
            }`}
          >
            <GenderMale weight="bold" className="w-5 h-5" />
            <span>Men&apos;s Lockers</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                activeRoom === "MEN" ? "bg-white/20 text-white" : "bg-zinc-700 text-zinc-400"
              }`}
            >
              {menLockers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveRoom("WOMEN")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${
              activeRoom === "WOMEN"
                ? "bg-pink-500 text-white shadow-lg shadow-pink-500/20"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
            }`}
          >
            <GenderFemale weight="bold" className="w-5 h-5" />
            <span>Women&apos;s Lockers</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                activeRoom === "WOMEN" ? "bg-white/20 text-white" : "bg-zinc-700 text-zinc-400"
              }`}
            >
              {womenLockers.length}
            </span>
          </button>
        </div>

        {/* Room Inventory Stats Badges */}
        <div className="flex items-center gap-3 px-3 py-1">
          <div
            className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border ${
              activeRoom === "WOMEN"
                ? "text-pink-400 bg-pink-400/10 border-pink-400/20"
                : "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                activeRoom === "WOMEN"
                  ? "bg-pink-400 shadow-sm shadow-pink-400/50"
                  : "bg-emerald-400 shadow-sm shadow-emerald-400/50"
              }`}
            />
            <span>Available: {roomStats.available}</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
            <span>Occupied: {roomStats.occupied}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <MagnifyingGlass className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${activeRoom === "MEN" ? "Men's" : "Women's"} lockers by number, key, or customer...`}
            className={`${inputClass} pl-10 py-2.5 text-sm`}
          />
        </div>

        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === "ALL" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter("AVAILABLE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === "AVAILABLE"
                ? activeRoom === "WOMEN"
                  ? "bg-pink-500 text-white shadow-sm shadow-pink-500/30"
                  : "bg-emerald-500 text-zinc-950"
                : activeRoom === "WOMEN"
                ? "text-pink-400/80 hover:text-pink-300"
                : "text-emerald-400/80 hover:text-emerald-300"
            }`}
          >
            Available
          </button>
          <button
            onClick={() => setStatusFilter("OCCUPIED")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              statusFilter === "OCCUPIED"
                ? "bg-amber-500 text-zinc-950"
                : "text-amber-400/80 hover:text-amber-300"
            }`}
          >
            Occupied
          </button>
        </div>
      </div>

      {/* Visual Locker Inventory Grid */}
      {lockerData.isLoading ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-16 text-center text-zinc-500">
          <div className="inline-block animate-spin mb-3">
            <ArrowsClockwise className="w-8 h-8 text-lime-400" />
          </div>
          <p className="font-semibold text-white">Loading {activeRoom === "MEN" ? "Men's" : "Women's"} Lockers...</p>
        </div>
      ) : visibleLockers.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-16 text-center text-zinc-500 space-y-3">
          <Lockers className="w-12 h-12 mx-auto text-zinc-600 mb-2" />
          <p className="font-bold text-white text-base">
            No {activeRoom === "MEN" ? "Men's" : "Women's"} lockers found matching your criteria
          </p>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            {currentRoomLockers.length === 0
              ? `There are currently no lockers configured for ${activeRoom === "MEN" ? "Men" : "Women"}.`
              : "Try adjusting your search query or status filter."}
          </p>
          {canManage && currentRoomLockers.length === 0 && (
            <button
              onClick={() => setShowAdd(true)}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 text-zinc-950 font-bold text-xs uppercase hover:bg-lime-300 transition-colors"
            >
              <Plus weight="bold" className="w-4 h-4" />
              <span>Add First Locker</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {visibleLockers.map(locker => {
            const assignment = activeAssignmentMap.get(locker.id);
            const isOccupied = locker.status === "OCCUPIED" || locker.status === "IN_USE" || Boolean(assignment);
            const isMaintenance = locker.status === "MAINTENANCE" || locker.status === "OUT_OF_SERVICE" || locker.isActive === false;
            const isWomenLocker = (locker.section || "").toLowerCase().includes("women");

            // Visual Styling:
            // Women's Available: Pink theme
            // Men's Available: Emerald green theme
            // Occupied: Amber (distinct from pink and green)
            // Maintenance: Inactive neutral grey
            const tileStyle = isMaintenance
              ? "border-zinc-700/60 bg-zinc-800/40 hover:border-zinc-600 opacity-80"
              : isOccupied
              ? "border-amber-500/40 bg-amber-500/10 hover:border-amber-500 hover:bg-amber-500/15"
              : isWomenLocker
              ? "border-pink-500/40 bg-pink-500/10 hover:border-pink-500 hover:bg-pink-500/15"
              : "border-emerald-500/40 bg-emerald-500/10 hover:border-emerald-500 hover:bg-emerald-500/15";

            const indicatorColor = isMaintenance
              ? "bg-zinc-500"
              : isOccupied
              ? "bg-amber-400 shadow-sm shadow-amber-400/50"
              : isWomenLocker
              ? "bg-pink-400 shadow-sm shadow-pink-400/50"
              : "bg-emerald-400 shadow-sm shadow-emerald-400/50";

            const statusText = isMaintenance
              ? "INACTIVE"
              : isOccupied
              ? "OCCUPIED"
              : "AVAILABLE";

            const statusTextColor = isMaintenance
              ? "text-zinc-400"
              : isOccupied
              ? "text-amber-400"
              : isWomenLocker
              ? "text-pink-400"
              : "text-emerald-400";

            return (
              <motion.button
                key={locker.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedLocker(locker)}
                className={`text-left border-2 rounded-2xl p-4 transition-all relative flex flex-col justify-between min-h-[135px] cursor-pointer ${tileStyle}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-black text-xl text-white tracking-tight">{locker.number}</span>
                    <div className="flex items-center gap-1.5">
                      {canManage && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingLocker(locker);
                          }}
                          title="Edit locker"
                          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-colors"
                        >
                          <PencilSimple className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <span className={`w-3 h-3 rounded-full ${indicatorColor}`} />
                    </div>
                  </div>

                  <div className={`text-[11px] font-black uppercase tracking-wider ${statusTextColor} mb-1 flex items-center gap-1`}>
                    {statusText}
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Key className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                    <span className="truncate">{locker.keyTag || locker.number}</span>
                  </div>

                  {isOccupied && assignment && (
                    <div className="text-xs font-semibold text-white truncate flex items-center gap-1">
                      <User className="w-3 h-3 text-amber-400 shrink-0" />
                      <span className="truncate">{assignment.memberName}</span>
                    </div>
                  )}

                  {!isOccupied && (
                    <div
                      className={`text-[11px] font-medium truncate ${
                        isWomenLocker ? "text-pink-400/80" : "text-emerald-400/80"
                      }`}
                    >
                      {canManage ? "Click to assign" : "Available · Click to view"}
                    </div>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Locker Assignment and Activity History Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <ArrowsClockwise className="w-5 h-5 text-lime-400" />
            <div>
              <h3 className="text-lg font-bold text-white">Locker Activity & Assignment History</h3>
              <p className="text-xs text-zinc-400">Record of locker assignments, key checkouts, returns, and handling staff.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-800/80 border border-zinc-700/60 rounded-xl p-1 self-start sm:self-auto">
            <button
              onClick={() => setHistoryRoomFilter("ALL")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                historyRoomFilter === "ALL" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              All Rooms
            </button>
            <button
              onClick={() => setHistoryRoomFilter("MEN")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                historyRoomFilter === "MEN" ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Men&apos;s
            </button>
            <button
              onClick={() => setHistoryRoomFilter("WOMEN")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                historyRoomFilter === "WOMEN" ? "bg-pink-600 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Women&apos;s
            </button>
            <span className="text-xs text-zinc-500 pl-2 pr-1 font-mono">{history.length}</span>
          </div>
        </div>

        {history.length === 0 ? (
          <p className="text-zinc-500 text-sm py-4">No assignment history recorded matching this filter.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {history.map(a => {
              const locker = lockerData.lockers.find(l => l.id === a.lockerId);
              const isActive = a.status === "active";
              const isWomenLocker = (locker?.section || "").toLowerCase().includes("women");
              const chip = isActive
                ? "bg-amber-400/15 text-amber-400 border border-amber-400/30"
                : isWomenLocker
                ? "bg-pink-400/15 text-pink-400 border border-pink-400/30"
                : "bg-emerald-400/15 text-emerald-400 border border-emerald-400/30";

              return (
                <div
                  key={a.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-800/40 border border-zinc-700/40 rounded-xl px-4 py-3 hover:border-zinc-600 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-bold text-white truncate flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold ${
                          isWomenLocker ? "bg-pink-500/20 text-pink-300 border border-pink-500/30" : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        }`}
                      >
                        {locker ? `Locker ${locker.number}` : "Locker"} ({isWomenLocker ? "Women" : "Men"})
                      </span>
                      <span>{a.memberName}</span>
                      {a.customerCode && (
                        <span className="text-xs text-zinc-400 font-mono">({a.customerCode})</span>
                      )}
                      {a.customerCategory && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {a.customerCategory}
                        </span>
                      )}
                      {a.customerPhone && (
                        <span className="text-xs text-zinc-400">· {a.customerPhone}</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-2">
                      <span>Key: <strong className="text-zinc-200">{a.keyNumber || locker?.keyTag || locker?.number || "—"}</strong></span>
                      <span>·</span>
                      <span>Assigned: <strong className="text-zinc-300">{new Date(a.assignedAt).toLocaleString()}</strong> by {a.issuedBy || "Staff"}</span>
                      {a.returnedAt && (
                        <>
                          <span>·</span>
                          <span className={isWomenLocker ? "text-pink-300" : "text-emerald-300"}>
                            Released: <strong>{new Date(a.returnedAt).toLocaleString()}</strong>
                            {a.returnedBy ? ` by ${a.returnedBy}` : ""}
                          </span>
                        </>
                      )}
                      {a.notes && (
                        <>
                          <span>·</span>
                          <span className="text-zinc-500 italic truncate max-w-xs">{a.notes}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shrink-0 self-start sm:self-center ${chip}`}>
                    {isActive ? "Active · Key Out" : "Released"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {selectedLocker && (
          <LockerDetailsModal
            locker={selectedLocker}
            activeRoom={activeRoom}
            activeAssignment={activeAssignmentMap.get(selectedLocker.id) || null}
            onClose={() => setSelectedLocker(null)}
            actor={actor}
            refresh={lockerData.refresh}
            canManage={canManage}
            onEdit={l => {
              setSelectedLocker(null);
              setEditingLocker(l);
            }}
            onDelete={l => handleDeleteLocker(l)}
          />
        )}
        {showAdd && canManage && (
          <AddLockerModal
            defaultRoom={activeRoom}
            onClose={() => setShowAdd(false)}
            refresh={lockerData.refresh}
          />
        )}
        {editingLocker && canManage && (
          <EditLockerModal
            locker={editingLocker}
            hasActiveAssignment={Boolean(activeAssignmentMap.get(editingLocker.id))}
            onClose={() => setEditingLocker(null)}
            refresh={lockerData.refresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal : Visual Locker Assignment & Return Management                      */
/* -------------------------------------------------------------------------- */

interface LockerDetailsModalProps {
  locker: Locker;
  activeRoom: RoomTab;
  activeAssignment: LockerAssignment | null;
  onClose: () => void;
  actor: string;
  refresh: () => Promise<void>;
  canManage: boolean;
  onEdit: (locker: Locker) => void;
  onDelete: (locker: Locker) => void;
}

function LockerDetailsModal({
  locker,
  activeRoom,
  activeAssignment,
  onClose,
  actor,
  refresh,
  canManage,
  onEdit,
  onDelete,
}: LockerDetailsModalProps) {
  const isOccupied = locker.status === "OCCUPIED" || locker.status === "IN_USE" || Boolean(activeAssignment);
  const isWomen = (locker.section || "").toLowerCase().includes("women") || activeRoom === "WOMEN";

  // Assignment form state
  const [customerSearch, setCustomerSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LockerCustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<LockerCustomerOption | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Return locker state
  const [isConfirmingReturn, setIsConfirmingReturn] = useState(false);
  const [returnNotes, setReturnNotes] = useState("");

  // Debounced customer search
  useEffect(() => {
    let active = true;
    const q = customerSearch.trim();
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchCustomersForLocker(q);
        if (active) setSearchResults(results);
      } catch (err) {
        console.error("Locker customer search failed:", err);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [customerSearch]);

  // Gender eligibility validation for the selected customer
  const eligibility = useMemo(() => {
    if (!selectedCustomer) return null;
    return validateLockerRoomEligibility(locker.section, selectedCustomer.gender);
  }, [locker.section, selectedCustomer]);

  // Handle assignment submission - automatic DB timestamp
  const handleAssignConfirm = async () => {
    if (!selectedCustomer) {
      toast.error("Please search and select a customer first.");
      return;
    }

    if (!eligibility?.eligible) {
      toast.error(eligibility?.reason || "Customer is ineligible for this locker room.");
      return;
    }

    setIsSubmitting(true);
    try {
      await assignLocker({
        lockerId: locker.id,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        issuedBy: actor,
      });
      await refresh();
      toast.success(`Locker ${locker.number} assigned to ${selectedCustomer.name}! Key handed out.`);
      onClose();
    } catch (cause) {
      console.error("Locker assignment failed:", cause);
      toast.error(cause instanceof Error ? cause.message : "Unable to assign locker.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle locker return
  const handleReturnConfirm = async () => {
    if (!activeAssignment) return;

    setIsSubmitting(true);
    try {
      await returnLockerAssignment({
        assignmentId: activeAssignment.id,
        lockerId: locker.id,
        actor,
        notes: returnNotes.trim(),
      });
      await refresh();
      toast.success(`Locker ${locker.number} returned successfully. Available for new assignment.`);
      onClose();
    } catch (cause) {
      console.error("Locker return failed:", cause);
      toast.error(cause instanceof Error ? cause.message : "Unable to return locker.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl relative"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-5 pb-4 border-b border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black uppercase text-white tracking-tight">{locker.number}</span>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wide ${
                  isOccupied
                    ? "bg-amber-400/15 text-amber-400 border border-amber-400/30"
                    : isWomen
                    ? "bg-pink-400/15 text-pink-400 border border-pink-400/30"
                    : "bg-emerald-400/15 text-emerald-400 border border-emerald-400/30"
                }`}
              >
                {isOccupied ? "Occupied · Key Out" : "Available"}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
              <span>{isWomen ? "Women's Locker Room" : "Men's Locker Room"}</span>
              <span>·</span>
              <span>Key: {locker.keyTag || locker.number}</span>
              {locker.notes && (
                <>
                  <span>·</span>
                  <span className="italic text-zinc-500">{locker.notes}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(locker)}
                  title="Edit Locker"
                  className="p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
                >
                  <PencilSimple className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={isOccupied}
                  onClick={() => onDelete(locker)}
                  title={isOccupied ? "Cannot delete an occupied locker" : "Delete Locker"}
                  className="p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-red-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ----------------- WORKFLOW: OCCUPIED LOCKER (RETURN) ----------------- */}
        {isOccupied && activeAssignment && (
          <div className="space-y-5">
            <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-bold uppercase text-zinc-400">Current Occupant Information</div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-400 font-bold">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-white text-base">{activeAssignment.memberName}</div>
                  <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-2 mt-0.5">
                    <span>ID: <strong className="text-zinc-200 font-mono">{activeAssignment.customerCode || activeAssignment.memberId}</strong></span>
                    {activeAssignment.customerCategory && (
                      <>
                        <span>·</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/80 text-zinc-200">
                          {activeAssignment.customerCategory}
                        </span>
                      </>
                    )}
                    {activeAssignment.customerPhone && (
                      <>
                        <span>·</span>
                        <span className="text-zinc-300">{activeAssignment.customerPhone}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-700/40 text-xs">
                <div>
                  <span className="text-zinc-500 block">Assigned Date & Time:</span>
                  <span className="text-zinc-200 font-medium">
                    {new Date(activeAssignment.assignedAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Issued By:</span>
                  <span className="text-zinc-200 font-medium">{activeAssignment.issuedBy || "Staff"}</span>
                </div>
                {activeAssignment.dueDate && (
                  <div>
                    <span className="text-zinc-500 block">Due Date:</span>
                    <span className="text-zinc-300 font-medium">{activeAssignment.dueDate}</span>
                  </div>
                )}
                {activeAssignment.notes && (
                  <div>
                    <span className="text-zinc-500 block">Notes:</span>
                    <span className="text-zinc-300 font-medium">{activeAssignment.notes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Return confirmation block */}
            {!canManage ? (
              <div className="text-xs text-zinc-400 p-3.5 rounded-2xl bg-zinc-800/40 border border-zinc-700/40 text-center space-y-1">
                <span className="font-semibold text-zinc-300 block">Read-Only Monitoring</span>
                <span>Locker key returns and intake workflows are operated exclusively by Reception staff.</span>
              </div>
            ) : !isConfirmingReturn ? (
              <button
                onClick={() => setIsConfirmingReturn(true)}
                className="w-full bg-emerald-400 text-zinc-950 py-3.5 rounded-xl font-bold hover:bg-emerald-300 transition-colors active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-emerald-400/10 text-sm uppercase"
              >
                <KeyReturn weight="bold" className="w-5 h-5" />
                <span>Return Locker & Key</span>
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-400/10 border border-amber-400/30 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start gap-2.5">
                  <Warning weight="fill" className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-300 text-sm">Confirm Locker Return</div>
                    <div className="text-xs text-zinc-300 mt-0.5">
                      Confirm that physical key <strong>{locker.keyTag || locker.number}</strong> has been returned by{" "}
                      <strong>{activeAssignment.memberName}</strong>?
                    </div>
                  </div>
                </div>

                <input
                  value={returnNotes}
                  onChange={e => setReturnNotes(e.target.value)}
                  placeholder="Optional return notes (e.g. key condition, locker checked)..."
                  className={inputClass}
                />

                <div className="flex gap-2">
                  <button
                    disabled={isSubmitting}
                    onClick={handleReturnConfirm}
                    className="flex-1 bg-emerald-400 text-zinc-950 font-bold py-2.5 rounded-xl hover:bg-emerald-300 text-xs uppercase"
                  >
                    {isSubmitting ? "Returning..." : "Confirm Return"}
                  </button>
                  <button
                    disabled={isSubmitting}
                    onClick={() => setIsConfirmingReturn(false)}
                    className="flex-1 bg-zinc-800 text-zinc-300 font-semibold py-2.5 rounded-xl hover:bg-zinc-700 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* ----------------- WORKFLOW: AVAILABLE LOCKER (ASSIGN) ----------------- */}
        {!isOccupied && (
          canManage ? (
            <div className="space-y-4">
              {/* Auto-populated locker number */}
              <div>
                <label className={labelClass}>Locker Assigned</label>
                <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white font-bold text-sm flex items-center justify-between">
                  <span>{locker.number} ({isWomen ? "Women's Room" : "Men's Room"})</span>
                  <span className={`text-xs font-mono ${isWomen ? "text-pink-400" : "text-lime-400"}`}>
                    Key: {locker.keyTag || locker.number}
                  </span>
                </div>
              </div>

              {/* Customer Search */}
              <div>
                <label className={labelClass}>Search Registered Customer</label>
                <div className="relative">
                  <MagnifyingGlass className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={customerSearch}
                    onChange={e => {
                      setCustomerSearch(e.target.value);
                      if (selectedCustomer) setSelectedCustomer(null);
                    }}
                    placeholder="Type customer name, phone, or Member ID (e.g. PP-001)..."
                    className={`${inputClass} pl-10 text-sm`}
                  />
                  {isSearching && (
                    <span className="text-xs text-zinc-500 absolute right-3.5 top-1/2 -translate-y-1/2">
                      Searching...
                    </span>
                  )}
                </div>

                {/* Search dropdown suggestions */}
                {searchResults.length > 0 && !selectedCustomer && (
                  <div className="mt-2 bg-zinc-800 border border-zinc-700 rounded-xl max-h-48 overflow-y-auto divide-y divide-zinc-700/50 shadow-xl">
                    {searchResults.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch(`${c.name} (${c.customerCode})`);
                          setSearchResults([]);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-zinc-700/60 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <div className="text-sm font-bold text-white">{c.name}</div>
                          <div className="text-xs text-zinc-400">
                            {c.customerCode} · {c.gender ? c.gender : "No gender on file"} · {c.category} {c.phone ? `· ${c.phone}` : ""}
                          </div>
                        </div>
                        <span className={`text-xs font-semibold ${isWomen ? "text-pink-400" : "text-lime-400"}`}>
                          Select
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Customer Verification Card */}
              {selectedCustomer && (
                <div className="bg-zinc-800/80 border border-zinc-700 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase text-zinc-400">Selected Customer Verification</div>
                    <button
                      onClick={() => setSelectedCustomer(null)}
                      className="text-xs text-zinc-400 hover:text-white"
                    >
                      Change
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold ${
                        isWomen ? "bg-pink-400/20 text-pink-400" : "bg-lime-400/20 text-lime-400"
                      }`}
                    >
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">{selectedCustomer.name}</div>
                      <div className="text-xs text-zinc-400">
                        ID: <span className="font-mono text-zinc-200">{selectedCustomer.customerCode}</span> · Category: {selectedCustomer.category}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-700/50 text-xs">
                    <div>
                      <span className="text-zinc-500 block">Gender Recorded:</span>
                      <span className="font-semibold text-zinc-200">
                        {selectedCustomer.gender || "MISSING"}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Assignment Timestamp:</span>
                      <span className={`font-semibold ${isWomen ? "text-pink-400" : "text-lime-400"}`}>
                        Recorded automatically (Now)
                      </span>
                    </div>
                  </div>

                  {/* Eligibility Validation Alert */}
                  {eligibility && !eligibility.eligible && (
                    <div className="mt-2 bg-red-400/10 border border-red-400/30 rounded-xl p-3 flex items-start gap-2 text-xs text-red-300">
                      <XCircle weight="fill" className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <span>{eligibility.reason}</span>
                    </div>
                  )}

                  {eligibility?.eligible && (
                    <div className="mt-2 bg-emerald-400/10 border border-emerald-400/30 rounded-xl p-2.5 flex items-center gap-2 text-xs text-emerald-300">
                      <Check weight="bold" className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Eligible for {isWomen ? "Women's" : "Men's"} locker assignment.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Assign Confirmation Button */}
              <button
                disabled={!selectedCustomer || !eligibility?.eligible || isSubmitting}
                onClick={handleAssignConfirm}
                className={`w-full py-3.5 rounded-xl font-bold transition-colors active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed text-sm uppercase mt-2 ${
                  isWomen
                    ? "bg-pink-500 text-white hover:bg-pink-400 shadow-pink-500/20"
                    : "bg-lime-400 text-zinc-950 hover:bg-lime-300 shadow-lime-400/10"
                }`}
              >
                <ShieldCheck weight="bold" className="w-5 h-5" />
                <span>{isSubmitting ? "Assigning Locker..." : "Confirm & Assign Locker"}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-2xl p-6 text-center space-y-3">
                <div
                  className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center ${
                    isWomen ? "bg-pink-400/20 text-pink-400" : "bg-emerald-400/20 text-emerald-400"
                  }`}
                >
                  <Key weight="bold" className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Locker {locker.number} is Available</h4>
                  <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                    This unit is vacant and ready for customer assignment. Physical key tag is{" "}
                    <strong className="text-zinc-200 font-mono">{locker.keyTag || locker.number}</strong>.
                  </p>
                </div>
                <div className="pt-3 border-t border-zinc-800 text-xs text-zinc-500">
                  Customer assignment, eligibility check, and physical key hand-out are operated by Reception.
                </div>
              </div>
            </div>
          )
        )}

        {/* Maintenance / Condition controls for staff */}
        {canManage && (
          <div className="mt-6 pt-5 border-t border-zinc-800 flex flex-wrap gap-2">
            <button
              onClick={() => onEdit(locker)}
              className="flex-1 py-2 px-3 rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-200 text-xs font-semibold hover:bg-zinc-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <PencilSimple className="w-3.5 h-3.5" />
              <span>Edit Locker</span>
            </button>

            {!isOccupied && (
              <>
                <button
                  onClick={() => onDelete(locker)}
                  className="py-2 px-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs font-semibold hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>

                {locker.status === "AVAILABLE" && locker.isActive !== false ? (
                  <button
                    onClick={async () => {
                      const reason = window.prompt("Reason for maintenance:");
                      if (!reason?.trim()) return;
                      await setLockerCondition(locker.id, "MAINTENANCE", true, reason);
                      await refresh();
                      toast.success("Locker placed in maintenance.");
                      onClose();
                    }}
                    className="flex-1 py-2 px-3 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200 text-xs font-semibold hover:bg-amber-400/20"
                  >
                    Place in Maintenance
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await setLockerCondition(locker.id, "AVAILABLE", true, "Restored to active");
                      await refresh();
                      toast.success("Locker restored to available.");
                      onClose();
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-lime-400 text-zinc-950 text-xs font-bold hover:bg-lime-300"
                  >
                    Restore to Available
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal : Add Locker                                                         */
/* -------------------------------------------------------------------------- */

function AddLockerModal({
  defaultRoom,
  onClose,
  refresh,
}: {
  defaultRoom: RoomTab;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const [section, setSection] = useState<"Men" | "Women">(defaultRoom === "MEN" ? "Men" : "Women");
  const [number, setNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isWomen = section === "Women";

  const handleAdd = async () => {
    const trimmedNumber = number.trim();
    if (!trimmedNumber) {
      toast.error("Please enter a locker number.");
      return;
    }

    setIsSubmitting(true);
    try {
      // The locker number is used directly as the physical key identifier
      await addLocker({
        number: trimmedNumber,
        room: section,
        keyTag: trimmedNumber,
      });
      await refresh();
      toast.success(`Locker ${trimmedNumber} created successfully.`);
      onClose();
    } catch (cause) {
      console.error("Unable to create locker", cause);
      toast.error(cause instanceof Error ? cause.message : "Unable to create locker.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl relative"
      >
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-zinc-800">
          <h3 className="text-xl font-black uppercase text-white flex items-center gap-2">
            <Lockers weight="fill" className={`w-5 h-5 ${isWomen ? "text-pink-400" : "text-lime-400"}`} />
            <span>Add Locker</span>
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Room Section</label>
            <select
              value={section}
              onChange={e => setSection(e.target.value as "Men" | "Women")}
              className={inputClass}
            >
              <option value="Men">Men&apos;s Locker Room</option>
              <option value="Women">Women&apos;s Locker Room</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Locker Number</label>
            <input
              value={number}
              onChange={e => setNumber(e.target.value)}
              placeholder="e.g. M-17 or W-17"
              className={inputClass}
              autoFocus
            />
            <p className="text-[11px] text-zinc-400 mt-1.5">
              The locker number is automatically used as the physical key identifier.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-800 text-xs"
            >
              Cancel
            </button>
            <button
              disabled={isSubmitting}
              onClick={handleAdd}
              className={`flex-1 font-bold py-3 rounded-xl text-xs uppercase transition-colors shadow-lg ${
                isWomen
                  ? "bg-pink-500 hover:bg-pink-400 text-white shadow-pink-500/20"
                  : "bg-lime-400 hover:bg-lime-300 text-zinc-950 shadow-lime-400/10"
              }`}
            >
              {isSubmitting ? "Creating..." : "Save Locker"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal : Edit Locker                                                        */
/* -------------------------------------------------------------------------- */

function EditLockerModal({
  locker,
  hasActiveAssignment,
  onClose,
  refresh,
}: {
  locker: Locker;
  hasActiveAssignment: boolean;
  onClose: () => void;
  refresh: () => Promise<void>;
}) {
  const initialRoom = (locker.section || "").toLowerCase().includes("wom") ? "Women" : "Men";
  const [section, setSection] = useState<"Men" | "Women">(initialRoom);
  const [number, setNumber] = useState(locker.number);
  const [keyTag, setKeyTag] = useState(locker.keyTag);
  const [notes, setNotes] = useState(locker.notes || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isWomen = section === "Women";

  const handleEdit = async () => {
    const trimmedNumber = number.trim();
    if (!trimmedNumber) {
      toast.error("Please enter a locker number.");
      return;
    }

    if (hasActiveAssignment && section !== initialRoom) {
      toast.error("Cannot change locker room while locker has an active customer assignment.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateLocker({
        id: locker.id,
        number: trimmedNumber,
        room: section,
        keyTag: keyTag.trim() || trimmedNumber,
        notes: notes.trim(),
      });
      await refresh();
      toast.success(`Locker ${trimmedNumber} updated successfully.`);
      onClose();
    } catch (cause) {
      console.error("Unable to update locker", cause);
      toast.error(cause instanceof Error ? cause.message : "Unable to update locker.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl relative"
      >
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-zinc-800">
          <h3 className="text-xl font-black uppercase text-white flex items-center gap-2">
            <PencilSimple weight="bold" className={`w-5 h-5 ${isWomen ? "text-pink-400" : "text-lime-400"}`} />
            <span>Edit Locker {locker.number}</span>
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Room Section</label>
            <select
              value={section}
              onChange={e => setSection(e.target.value as "Men" | "Women")}
              disabled={hasActiveAssignment}
              className={`${inputClass} ${hasActiveAssignment ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <option value="Men">Men&apos;s Locker Room</option>
              <option value="Women">Women&apos;s Locker Room</option>
            </select>
            {hasActiveAssignment && (
              <p className="text-[11px] text-amber-400 mt-1">
                Room cannot be changed while locker is actively assigned to a customer.
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Locker Number</label>
            <input
              value={number}
              onChange={e => setNumber(e.target.value)}
              placeholder="e.g. M-01 or W-01"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Physical Key Tag / Code</label>
            <input
              value={keyTag}
              onChange={e => setKeyTag(e.target.value)}
              placeholder="Defaults to locker number if empty"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Row 1 Top"
              className={inputClass}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-800 text-xs"
            >
              Cancel
            </button>
            <button
              disabled={isSubmitting}
              onClick={handleEdit}
              className={`flex-1 font-bold py-3 rounded-xl text-xs uppercase transition-colors shadow-lg ${
                isWomen
                  ? "bg-pink-500 hover:bg-pink-400 text-white shadow-pink-500/20"
                  : "bg-lime-400 hover:bg-lime-300 text-zinc-950 shadow-lime-400/10"
              }`}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
