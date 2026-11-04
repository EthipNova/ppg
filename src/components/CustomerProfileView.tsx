import { useState, useEffect, useCallback, useRef } from "react";
import {
  User,
  IdentificationBadge,
  Phone,
  Calendar,
  Lock,
  Camera,
  ArrowClockwise,
  ShieldCheck,
  GenderIntersex,
  GraduationCap,
  Sparkle,
  MoonStars,
  MusicNotes,
  Info,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  fetchCustomerProfile,
  uploadCustomerProfilePhoto,
  type CustomerProfileState,
} from "../services/customerProfileService";
import MotivationalWatermark from "./MotivationalWatermark";

const CARD = "bg-zinc-900 border border-zinc-800 rounded-2xl p-6";
const READONLY_ROW = "bg-zinc-800/40 border border-zinc-800/70 rounded-xl px-4 py-3 flex items-center justify-between";

export interface WomensHourRule {
  id: string;
  startTime: string;
  endTime: string;
  days: string[];
  description?: string;
}

export interface WomensHourTrainer {
  id: string;
  name: string;
  specialties: string[];
  bio?: string;
}

interface CustomerProfileViewProps {
  customerId: string;
  onProfileUpdated?: () => void;
  isMuslimCategory?: boolean;
  womensHourRules?: WomensHourRule[];
  womensHourTrainers?: WomensHourTrainer[];
}

export default function CustomerProfileView({
  customerId,
  onProfileUpdated,
}: CustomerProfileViewProps) {
  const [state, setState] = useState<CustomerProfileState>({ status: "loading" });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadProfile = useCallback(() => {
    setState({ status: "loading" });
    fetchCustomerProfile(customerId)
      .then(res => {
        setState(res);
      })
      .catch(err => {
        console.error("[CustomerProfileView] Failed to load profile:", err);
        setState({
          status: "error",
          error: "Failed to connect to the database. Please check your internet connection.",
        });
      });
  }, [customerId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Please upload a valid JPEG, PNG, or WEBP photo.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo exceeds 5MB limit. Please choose a smaller image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadingPhoto(true);
    const result = await uploadCustomerProfilePhoto(customerId, file);
    setUploadingPhoto(false);

    if (!result.success) {
      toast.error(result.error || "Failed to update profile photo.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Immediately display the updated photo
    if (result.photoUrl) {
      setState(prev => {
        if (prev.status === "success") {
          return {
            ...prev,
            data: {
              ...prev.data,
              photoUrl: result.photoUrl || null,
            },
          };
        }
        return prev;
      });
    }

    toast.success("Profile photo updated successfully!");
    onProfileUpdated?.();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (state.status === "loading") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="w-10 h-10 border-4 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mx-auto mb-4" />
        <h3 className="text-base font-bold text-white">Loading Profile...</h3>
        <p className="text-xs text-zinc-500 mt-1">Retrieving customer records from Supabase</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="max-w-lg mx-auto">
        <div className={`${CARD} text-center space-y-4`}>
          <div className="w-12 h-12 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto text-red-400">
            <User className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Unable to Load Profile</h3>
          <p className="text-sm text-zinc-400">{state.error}</p>
          <button
            onClick={loadProfile}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors inline-flex items-center gap-2 mx-auto cursor-pointer"
          >
            <ArrowClockwise weight="bold" className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className="max-w-lg mx-auto">
        <div className={`${CARD} text-center space-y-3`}>
          <User className="w-12 h-12 text-zinc-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">Profile Not Found</h3>
          <p className="text-sm text-zinc-500">{state.message}</p>
        </div>
      </div>
    );
  }

  const profile = state.data;
  const categoryIconMap: Record<string, typeof Sparkle> = {
    STUDENT: GraduationCap,
    MUSLIM: MoonStars,
    AEROBICS: MusicNotes,
    REGULAR: Sparkle,
  };
  const CategoryIcon = categoryIconMap[profile.customerType.toUpperCase()] || Sparkle;

  return (
    <div className="max-w-lg mx-auto space-y-6 relative">
      <MotivationalWatermark
        phrases={["YOUR JOURNEY.", "STAY DISCIPLINED.", "BUILT NOT GIVEN."]}
        opacity="opacity-[0.03]"
      />
      <div className="relative z-10 space-y-6">
      {/* Profile Photo Header Card */}
      <div className={`${CARD} flex flex-col sm:flex-row items-center gap-5 relative overflow-hidden`}>
        <div className="relative group shrink-0">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 border-2 border-lime-400/30 flex items-center justify-center relative shadow-xl shadow-black/40">
            {profile.photoUrl ? (
              <img
                src={profile.photoUrl}
                alt={profile.fullName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-500">
                <User weight="fill" className="w-10 h-10 text-zinc-400" />
              </div>
            )}
            {uploadingPhoto && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-lime-400/20 border-t-lime-400 rounded-full animate-spin" />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            aria-label="Upload profile photo"
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-lime-400 text-zinc-950 flex items-center justify-center shadow-lg hover:bg-lime-300 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Camera weight="bold" className="w-4 h-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePhotoSelect}
          className="hidden"
        />

        <div className="text-center sm:text-left min-w-0 flex-1">
          <h2 className="text-xl font-bold text-white truncate">{profile.fullName}</h2>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">{profile.customerCode}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-lime-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Camera weight="bold" className="w-3.5 h-3.5" />
              <span>{profile.photoUrl ? "Change Photo" : "Upload Photo"}</span>
            </button>
            <span className="text-[11px] text-zinc-500">JPG, PNG, or WEBP (max 5MB)</span>
          </div>
        </div>
      </div>

      {/* Account Details (Read-Only) */}
      <div className={CARD}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center text-lime-400">
              <ShieldCheck weight="fill" className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Account Details</h3>
              <p className="text-xs text-zinc-400">Customer account identification</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase bg-lime-400/15 text-lime-400 border border-lime-400/25">
            <span className="w-1.5 h-1.5 rounded-full bg-lime-400" />
            {profile.status}
          </span>
        </div>

        <div className="space-y-3 pt-1">
          {/* Customer ID / Login ID */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
              Customer ID / Login ID
            </label>
            <div className={READONLY_ROW}>
              <span className="font-mono font-bold text-white flex items-center gap-2 text-sm">
                <IdentificationBadge weight="fill" className="w-4 h-4 text-lime-400" />
                {profile.customerCode}
              </span>
              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Read-only ID
              </span>
            </div>
          </div>

          {/* Membership Category */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
              Membership Category
            </label>
            <div className={READONLY_ROW}>
              <span className="font-semibold text-white capitalize flex items-center gap-2 text-sm">
                <CategoryIcon weight="fill" className="w-4 h-4 text-lime-400" />
                {profile.customerType.toLowerCase()}
              </span>
              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Managed by Gym
              </span>
            </div>
          </div>

          {/* Member Since */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
              Member Since
            </label>
            <div className={READONLY_ROW}>
              <span className="font-medium text-white flex items-center gap-2 text-sm">
                <Calendar weight="fill" className="w-4 h-4 text-zinc-400" />
                {profile.joinDate}
              </span>
              <span className="text-[11px] text-zinc-500">Registration date</span>
            </div>
          </div>
        </div>
      </div>

      {/* Personal Information (Read-Only) */}
      <div className={CARD}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center text-lime-400">
            <User weight="fill" className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">Personal Information</h3>
            <p className="text-xs text-zinc-400">Registered customer records</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Full Name */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
              Full Name
            </label>
            <div className={READONLY_ROW}>
              <span className="font-semibold text-white text-sm">{profile.fullName}</span>
              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Read-only
              </span>
            </div>
          </div>

          {/* Phone Number */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
              Phone Number
            </label>
            <div className={READONLY_ROW}>
              <span className="font-medium text-white flex items-center gap-2 text-sm">
                <Phone weight="fill" className="w-4 h-4 text-lime-400" />
                {profile.phone}
              </span>
              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Read-only
              </span>
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
              Gender
            </label>
            <div className={READONLY_ROW}>
              <span className="font-medium text-white flex items-center gap-2 text-sm">
                <GenderIntersex weight="bold" className="w-4 h-4 text-zinc-400" />
                {profile.gender || "Not specified"}
              </span>
              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Read-only
              </span>
            </div>
          </div>

          {/* Student Fields (if applicable) */}
          {profile.customerType.toUpperCase() === "STUDENT" && (
            <>
              {profile.institution && (
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                    Institution
                  </label>
                  <div className={READONLY_ROW}>
                    <span className="font-medium text-white flex items-center gap-2 text-sm">
                      <GraduationCap weight="fill" className="w-4 h-4 text-lime-400" />
                      {profile.institution}
                    </span>
                    <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Read-only
                    </span>
                  </div>
                </div>
              )}

              {profile.studentId && (
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                    Student ID
                  </label>
                  <div className={READONLY_ROW}>
                    <span className="font-mono font-medium text-white text-sm">
                      {profile.studentId}
                    </span>
                    <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Read-only
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Helpful info box explaining read-only policy */}
      <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl flex items-start gap-3 text-xs text-zinc-400">
        <Info weight="fill" className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
        <p>
          For security and membership integrity, personal and account information is managed by the gym staff. If you need to update your phone number, name, or membership category, please visit the Reception desk.
        </p>
      </div>
      </div>
    </div>
  );
}
