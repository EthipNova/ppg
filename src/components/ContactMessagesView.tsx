import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  MagnifyingGlass,
  CheckCircle,
  Eye,
  Trash,
  Clock,
  ChatCircleText,
  ArrowClockwise,
  X,
  ChatDots,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  fetchContactMessages,
  updateContactMessageStatus,
  deleteContactMessage,
  formatPhoneNumber,
  type ContactMessage,
  type ContactMessageStatus,
} from "../services/contactMessagesService";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-5";

export default function ContactMessagesView() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"UNRESOLVED" | "RESOLVED" | "ALL">("UNRESOLVED");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchContactMessages();
      setMessages(data);
    } catch (err: unknown) {
      console.error("[ContactMessagesView] Failed to load messages:", err);
      toast.error("Could not load contact messages from database.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMessages();
    toast.success("Messages refreshed.");
  };

  const handleStatusChange = async (msg: ContactMessage, newStatus: "NEW" | "RESOLVED") => {
    setUpdatingId(msg.id);
    try {
      await updateContactMessageStatus(msg.id, newStatus);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, status: newStatus, updated_at: new Date().toISOString() } : m))
      );
      if (selectedMessage?.id === msg.id) {
        setSelectedMessage((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      toast.success(newStatus === "RESOLVED" ? "Message marked as resolved." : "Inquiry reopened.");
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to update status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      await deleteContactMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (selectedMessage?.id === id) setSelectedMessage(null);
      toast.success("Message deleted.");
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to delete message.");
    }
  };

  const filteredMessages = useMemo(() => {
    let list = messages;
    if (statusFilter === "UNRESOLVED") {
      list = list.filter((m) => m.status !== "RESOLVED");
    } else if (statusFilter === "RESOLVED") {
      list = list.filter((m) => m.status === "RESOLVED");
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.phone.toLowerCase().includes(q) ||
          m.message.toLowerCase().includes(q)
      );
    }
    return list;
  }, [messages, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    return {
      all: messages.length,
      unresolved: messages.filter((m) => m.status !== "RESOLVED").length,
      resolved: messages.filter((m) => m.status === "RESOLVED").length,
    };
  }, [messages]);

  const renderStatusBadge = (status: ContactMessage["status"]) => {
    if (status === "RESOLVED") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-lime-400/20 text-lime-400 border border-lime-400/30">
          <CheckCircle weight="fill" className="w-3 h-3 text-lime-400" />
          Resolved
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Unresolved
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className={`${CARD} space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center text-lime-400 shrink-0">
              <ChatDots weight="fill" className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Public Website Inquiries
              </h2>
              <p className="text-xs text-zinc-400">
                Messages and inquiries submitted by visitors from the public website
              </p>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors flex items-center gap-1.5 text-xs font-semibold self-start sm:self-auto"
            title="Refresh messages"
          >
            <ArrowClockwise
              weight="bold"
              className={`w-4 h-4 ${refreshing ? "animate-spin text-lime-400" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>

        {/* Search & Status Filters */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-zinc-800">
          <div className="relative flex-1">
            <MagnifyingGlass className="w-5 h-5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by sender name, phone number, or inquiry text..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: "UNRESOLVED", label: "Unresolved", count: counts.unresolved },
              { key: "RESOLVED", label: "Resolved", count: counts.resolved },
              { key: "ALL", label: "All Messages", count: counts.all },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key as "UNRESOLVED" | "RESOLVED" | "ALL")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  statusFilter === f.key
                    ? "bg-lime-400 text-zinc-950 shadow-sm"
                    : "bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800"
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    statusFilter === f.key ? "bg-zinc-950 text-lime-400" : "bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Messages Listing */}
      {loading ? (
        <div className={`${CARD} py-16 text-center text-zinc-500`}>
          <div className="w-8 h-8 border-2 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Loading contact messages from database...</p>
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className={`${CARD} py-16 text-center space-y-3`}>
          <ChatCircleText weight="light" className="w-12 h-12 text-zinc-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No contact messages found</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            {searchQuery
              ? "No messages match your search criteria. Try a different search term or filter."
              : "No visitor inquiries have been submitted through the public website yet."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Message Cards (< 768px): Responsive grid (1 col on 320px, 2 cols on 430px+) */}
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:hidden gap-3">
            {filteredMessages.map((msg) => (
              <div
                key={msg.id}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-sm hover:border-zinc-700 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-bold text-white text-sm truncate">{msg.name}</span>
                    {renderStatusBadge(msg.status)}
                  </div>

                  {/* Direct Clickable Phone Link */}
                  <a
                    href={`tel:${msg.phone}`}
                    className="inline-flex items-center gap-1.5 text-lime-400 font-mono font-bold text-xs py-1 px-2 rounded-lg bg-lime-400/10 border border-lime-400/20 hover:bg-lime-400/20 transition-colors mb-2.5 active:scale-95"
                    title="Click to call"
                  >
                    <Phone weight="fill" className="w-3.5 h-3.5 shrink-0" />
                    <span>{formatPhoneNumber(msg.phone)}</span>
                  </a>

                  <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed mb-2 bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/80">
                    "{msg.message}"
                  </p>

                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{new Date(msg.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>

                {/* Mobile Action Buttons */}
                <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setSelectedMessage(msg)}
                    className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-xs font-semibold text-zinc-300 flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {msg.status !== "RESOLVED" ? (
                      <button
                        onClick={() => handleStatusChange(msg, "RESOLVED")}
                        disabled={updatingId === msg.id}
                        className="px-2.5 py-1.5 rounded-xl bg-lime-400/15 text-lime-400 hover:bg-lime-400/25 border border-lime-400/30 text-xs font-bold"
                        title="Mark as resolved"
                      >
                        Resolve
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(msg, "NEW")}
                        disabled={updatingId === msg.id}
                        className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium"
                        title="Re-open inquiry"
                      >
                        Re-open
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View (>= 768px) */}
          <div className="hidden md:block bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-950/80 text-zinc-400 text-xs uppercase tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4 font-bold">Status</th>
                    <th className="py-3 px-4 font-bold">Sender Name</th>
                    <th className="py-3 px-4 font-bold">Phone Number</th>
                    <th className="py-3 px-4 font-bold">Message</th>
                    <th className="py-3 px-4 font-bold whitespace-nowrap">Submitted</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
                  {filteredMessages.map((msg) => (
                    <tr key={msg.id} className="hover:bg-zinc-850/60 transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(msg.status)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-white whitespace-nowrap">
                        {msg.name}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <a
                          href={`tel:${msg.phone}`}
                          className="inline-flex items-center gap-1.5 text-lime-400 font-mono font-bold hover:underline"
                          title="Click to call sender"
                        >
                          <Phone weight="fill" className="w-3.5 h-3.5" />
                          <span>{formatPhoneNumber(msg.phone)}</span>
                        </a>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs truncate text-xs text-zinc-300" title={msg.message}>
                        {msg.message}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-zinc-400 font-mono">
                        {new Date(msg.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedMessage(msg)}
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                            title="View Full Inquiry"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {msg.status !== "RESOLVED" ? (
                            <button
                              onClick={() => handleStatusChange(msg, "RESOLVED")}
                              disabled={updatingId === msg.id}
                              className="px-2.5 py-1 rounded-lg bg-lime-400/10 hover:bg-lime-400/20 text-lime-400 border border-lime-400/30 text-xs font-semibold transition-colors"
                              title="Mark Resolved"
                            >
                              Resolve
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStatusChange(msg, "NEW")}
                              disabled={updatingId === msg.id}
                              className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-400 text-xs font-medium transition-colors"
                              title="Re-open Inquiry"
                            >
                              Re-open
                            </button>
                          )}

                          <button
                            onClick={() => handleDelete(msg.id)}
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Message Detail Modal Dialog */}
      <AnimatePresence>
        {selectedMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setSelectedMessage(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 w-full max-w-lg space-y-6 shadow-2xl relative"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-lime-400/10 border border-lime-400/30 flex items-center justify-center text-lime-400 shrink-0 font-black text-lg">
                    {selectedMessage.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedMessage.name}</h3>
                    <p className="text-xs text-zinc-400">
                      Submitted on{" "}
                      {new Date(selectedMessage.created_at).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedMessage(null)}
                  className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status and Direct Call Card */}
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-bold mb-1">
                    Current Status
                  </div>
                  {renderStatusBadge(selectedMessage.status)}
                </div>

                <a
                  href={`tel:${selectedMessage.phone}`}
                  className="px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-zinc-950 font-bold text-xs flex items-center gap-2 transition-all active:scale-95"
                >
                  <Phone weight="fill" className="w-4 h-4" />
                  <span>Call {formatPhoneNumber(selectedMessage.phone)}</span>
                </a>
              </div>

              {/* Full Message Body */}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider">
                  Visitor Inquiry / Message
                </label>
                <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-200 leading-relaxed whitespace-pre-line max-h-60 overflow-y-auto">
                  {selectedMessage.message}
                </div>
              </div>

              {/* Status Actions */}
              <div className="pt-2 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {selectedMessage.status !== "RESOLVED" ? (
                    <button
                      onClick={() => handleStatusChange(selectedMessage, "RESOLVED")}
                      className="px-4 py-2 rounded-xl bg-lime-400 text-zinc-950 font-bold text-xs hover:bg-lime-300 transition-colors"
                    >
                      Mark as Resolved
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStatusChange(selectedMessage, "NEW")}
                      className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-colors"
                    >
                      Re-open Inquiry
                    </button>
                  )}
                </div>

                <button
                  onClick={() => handleDelete(selectedMessage.id)}
                  className="px-3 py-2 rounded-xl text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Trash className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
