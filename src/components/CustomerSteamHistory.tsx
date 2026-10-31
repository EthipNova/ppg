import { useState, useEffect, useCallback } from "react";
import { Drop, Calendar, CreditCard, Clock, ArrowClockwise } from "@phosphor-icons/react";
import { supabase } from "../integrations/supabase/client";
import { formatETB } from "../context/GymContext";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";

export interface SteamHistoryItem {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentStatus: string;
  serviceStatus: string;
  createdAt: string;
}

interface CustomerSteamHistoryProps {
  customerId: string;
}

const METHOD_NAMES: Record<string, string> = {
  CASH: "Cash",
  TELEBIRR: "Telebirr",
  CBE_BIRR: "CBE Birr",
  telebirr: "Telebirr",
  cbe_birr: "CBE Birr",
  cash: "Cash",
};

function formatSteamDate(isoStr: string): { date: string; time: string } {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return { date: isoStr, time: "" };
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { date: isoStr, time: "" };
  }
}

export default function CustomerSteamHistory({ customerId }: CustomerSteamHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<SteamHistoryItem[]>([]);

  const loadSteamHistory = useCallback(async () => {
    if (!customerId) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query authoritative steam_services table filtered by customer_id
      // RLS on steam_services restricts access to the authenticated user's customer record
      const { data, error: queryError } = await supabase
        .from("steam_services")
        .select("id, amount, payment_method, payment_status, service_status, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (queryError) {
        console.error("[CustomerSteamHistory] Query error:", queryError);
        setError("Unable to load Steam history. Please check your connection.");
        setLoading(false);
        return;
      }

      const items: SteamHistoryItem[] = (data || []).map(r => ({
        id: r.id,
        amount: Number(r.amount || 0),
        paymentMethod: r.payment_method || "CASH",
        paymentStatus: (r.payment_status || "COMPLETED").toUpperCase(),
        serviceStatus: (r.service_status || "COMPLETED").toUpperCase(),
        createdAt: r.created_at,
      }));

      setRecords(items);
      setLoading(false);
    } catch (err) {
      console.error("[CustomerSteamHistory] Unexpected error:", err);
      setError("An unexpected error occurred while loading Steam records.");
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadSteamHistory();
  }, [loadSteamHistory]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <div className="w-10 h-10 border-4 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
        <h3 className="text-base font-bold text-white">Loading Steam History...</h3>
        <p className="text-xs text-zinc-500 mt-1">Retrieving your Steam service records</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className={`${CARD} text-center space-y-4`}>
          <div className="w-12 h-12 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto text-red-400">
            <Drop className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Unable to Load Steam History</h3>
          <p className="text-sm text-zinc-400">{error}</p>
          <button
            onClick={loadSteamHistory}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors inline-flex items-center gap-2 mx-auto cursor-pointer"
          >
            <ArrowClockwise weight="bold" className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className={`${CARD} relative overflow-hidden`}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-cyan-400/15 border border-cyan-400/25 flex items-center justify-center text-cyan-400 shrink-0">
            <Drop weight="fill" className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Steam Service History</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Personal record of your steam room sessions and payments
            </p>
          </div>
        </div>
      </div>

      {/* History Records or Empty State */}
      {records.length === 0 ? (
        <div className={`${CARD} py-12 text-center space-y-3`}>
          <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center mx-auto text-zinc-500">
            <Drop weight="fill" className="w-7 h-7 text-cyan-400/60" />
          </div>
          <h3 className="text-base font-bold text-white">
            You haven't used the Steam service yet.
          </h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Steam room passes and individual sessions are registered and paid for directly at the gym reception desk.
          </p>
        </div>
      ) : (
        <div className={`${CARD} space-y-4`}>
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Services Used ({records.length})
            </span>
            <span className="text-xs text-zinc-500 font-medium">Authoritative Records</span>
          </div>

          <div className="space-y-3">
            {records.map(record => {
              const { date, time } = formatSteamDate(record.createdAt);
              const methodName = METHOD_NAMES[record.paymentMethod] || record.paymentMethod;

              return (
                <div
                  key={record.id}
                  className="bg-zinc-800/40 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                      <Drop weight="fill" className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">Steam Bath Session</span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 border border-emerald-400/25">
                          {record.paymentStatus}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar weight="fill" className="w-3.5 h-3.5 text-zinc-500" />
                          {date}
                        </span>
                        {time && (
                          <span className="flex items-center gap-1 font-mono text-zinc-500">
                            <Clock className="w-3 h-3" />
                            {time}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-zinc-300">
                          <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                          {methodName}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right sm:self-center pl-12 sm:pl-0">
                    <span className="text-sm font-bold text-lime-400">
                      {formatETB(record.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
