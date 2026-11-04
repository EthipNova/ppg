import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Barbell, Users, Lightning, ShieldCheck, Heart, Star, MapPin, Phone, Envelope, ArrowRight, CheckCircle, Clock, Flame, GraduationCap, MoonStars, MusicNotes, Sparkle } from "@phosphor-icons/react";
import { useGym, formatETB, sendEmail, planAppliesToCategory, planCategoryText, categoryLabelOf } from "../context/GymContext";
import type { CustomerCategory, Member, Plan, CategoryLabel } from "../types";
import { fetchPlans } from "../services/plans";
import { fetchCategories } from "../services/categories";
import { fetchPublicActiveMembersCount } from "../services/gymSettingsService";
import { submitContactMessage, isValidPhoneNumber } from "../services/contactMessagesService";
import { fetchActiveWebsiteMedia } from "../services/websiteMediaService";

const CATEGORY_ICONS: Record<string, typeof Sparkle> = { REGULAR: Sparkle, STUDENT: GraduationCap, MUSLIM: MoonStars, AEROBICS: MusicNotes };
const LOCAL_SHOWCASE_IMAGE = "/images/powerplus-wall.jpg";
const FALLBACK_SHOWCASE_IMAGE = "/images/gym-hero-male.jpg";
import { toast } from "sonner";
import { registerCustomer } from "../services/registration";
import { fetchPlansForCategory, PlanLoadError } from "../services/studentMembershipService";

export default function PublicWebsite({
  onJoin,
  initialSection,
}: {
  onJoin?: (member: Member) => void | Promise<void>;
  initialSection?: "plans" | "facilities" | "about" | "contact";
}) {
  const { state, dispatch } = useGym();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("p2");
  const [selectedCategory, setSelectedCategory] = useState<CustomerCategory>("REGULAR");
  const [joinCategory, setJoinCategory] = useState<CustomerCategory>("REGULAR");
  const [joinForm, setJoinForm] = useState({ name: "", phone: "", email: "", studentId: "", institution: "" });
  const [joinPassword, setJoinPassword] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [studentPlans, setStudentPlans] = useState<Plan[]>([]);
  const [studentPlansState, setStudentPlansState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [studentPlansError, setStudentPlansError] = useState("");
  const planRequestId = useRef(0);
  const [joinErrors, setJoinErrors] = useState<Record<string, string>>({});
  const [contactForm, setContactForm] = useState({ name: "", phone: "", message: "" });
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  // Live real data from Supabase
  const [liveActiveMembers, setLiveActiveMembers] = useState<number | null>(null);
  const [categories, setCategories] = useState<CategoryLabel[]>(state.categoryLabels);
  const [livePlans, setLivePlans] = useState<Plan[]>([]);
  const [isPlansLoading, setIsPlansLoading] = useState<boolean>(true);
  const [plansLoadError, setPlansLoadError] = useState<string | null>(null);
  const [showcaseImgSrc, setShowcaseImgSrc] = useState(LOCAL_SHOWCASE_IMAGE);

  // Keep local categories in sync with global state if it updates
  useEffect(() => {
    if (state.categoryLabels && state.categoryLabels.length > 0) {
      setCategories(state.categoryLabels);
    }
  }, [state.categoryLabels]);

  // Keep local plans in sync with global state if it updates
  useEffect(() => {
    if (state.plans && state.plans.length > 0) {
      setLivePlans(state.plans.filter(p => p.active));
      setIsPlansLoading(false);
    }
  }, [state.plans]);

  // Smooth scroll to target section when requested via route or link
  useEffect(() => {
    if (initialSection) {
      const el = document.getElementById(initialSection);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth" });
        }, 120);
      }
    }
  }, [initialSection]);

  const loadPublicData = async () => {
    setIsPlansLoading(true);
    setPlansLoadError(null);
    try {
      const [count, fetchedCats, plans, activeMedia] = await Promise.all([
        fetchPublicActiveMembersCount().catch(() => null),
        fetchCategories().catch(() => state.categoryLabels),
        fetchPlans(undefined, false),
        fetchActiveWebsiteMedia("where_the_work_happens").catch(() => null),
      ]);
      if (count !== null) setLiveActiveMembers(count);
      if (fetchedCats && fetchedCats.length > 0) {
        setCategories(fetchedCats);
        dispatch({ type: "SET_CATEGORIES", payload: fetchedCats });
      }
      if (plans) {
        setLivePlans(plans);
        dispatch({ type: "SET_PLANS", payload: plans });
      }
      if (activeMedia?.imageUrl) setShowcaseImgSrc(activeMedia.imageUrl);
      setIsPlansLoading(false);
    } catch (err: any) {
      console.warn("Public website data load:", err);
      setIsPlansLoading(false);
      setPlansLoadError(err?.message || "Failed to load membership plans. Please check your connection and retry.");
    }
  };

  // Load real active members count, categories, plans, and showcase media from Supabase
  useEffect(() => {
    void loadPublicData();

    // Listen for live media updates from Admin Settings
    const handleMediaUpdated = async () => {
      const activeMedia = await fetchActiveWebsiteMedia("where_the_work_happens").catch(() => null);
      if (activeMedia?.imageUrl) {
        setShowcaseImgSrc(activeMedia.imageUrl);
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("powerplus:media-updated", handleMediaUpdated);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("powerplus:media-updated", handleMediaUpdated);
      }
    };
  }, []);

  const activePlans = livePlans.length > 0 ? livePlans : state.plans.filter(p => p.active);
  const visibleCategories = (categories.length > 0 ? categories : state.categoryLabels).filter(c => c.isActive !== false);

  useEffect(() => {
    if (visibleCategories.length > 0 && !visibleCategories.some(c => c.category === selectedCategory)) {
      setSelectedCategory(visibleCategories[0].category);
    }
  }, [visibleCategories, selectedCategory]);

  const displayedPlans = activePlans.filter(p => p.active && planAppliesToCategory(p, selectedCategory));
  const plansForCategory = joinCategory === "STUDENT" && studentPlans.length > 0
    ? studentPlans
    : activePlans.filter(p => p.active && planAppliesToCategory(p, joinCategory));

  const handleCategorySelect = (category: CustomerCategory) => {
    setSelectedCategory(category);
    void selectCategory(category);
  };

  const selectCategory = async (category: CustomerCategory) => {
    const requestId = ++planRequestId.current;
    setJoinCategory(category);
    setJoinErrors({});
    if (category === "STUDENT") {
      setStudentPlansState("loading");
      setStudentPlans([]);
      setStudentPlansError("");
      try {
        const loadedPlans = await fetchPlansForCategory("STUDENT");
        if (requestId !== planRequestId.current) return;
        const plans = loadedPlans.map(plan => ({
          id: plan.id, name: plan.name, price: plan.price, durationDays: plan.durationDays,
          perks: plan.benefits ? plan.benefits.split(",").map(value => value.trim()).filter(Boolean) : [],
          active: true, applicableCategories: ["STUDENT"] as CustomerCategory[],
        }));
        setStudentPlans(plans);
        setStudentPlansState("ready");
        setSelectedPlan(plans[0]?.id ?? "");
      } catch (error) {
        if (requestId !== planRequestId.current) return;
        const message = error instanceof PlanLoadError
          ? error.kind === "network"
            ? "Check your connection and retry."
            : error.kind === "permission"
              ? "Student plan access is temporarily unavailable. Please try again later."
              : error.kind === "invalid_category"
                ? "Student plans could not be matched. Please contact reception."
                : error.kind === "schema"
                  ? "Student plan data is not configured correctly. Please contact the gym administrator."
                : "Student plans are temporarily unavailable. Please try again later."
          : "Student plans are temporarily unavailable. Please try again later.";
        setStudentPlansState("error");
        setStudentPlansError(message);
        toast.error(`Student plans could not be loaded. ${message}`);
      }
      return;
    }
    setStudentPlansState("idle");
    setStudentPlansError("");
    const next = activePlans.find(p => p.active && planAppliesToCategory(p, category));
    setSelectedPlan(next?.id ?? "");
  };

  const handleJoin = async () => {
    const nextErrors: Record<string, string> = {};
    if (!joinForm.name.trim()) nextErrors.name = "Enter your full name.";
    if (!joinForm.phone.trim()) nextErrors.phone = "Enter your phone number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(joinForm.email.trim())) nextErrors.email = "Enter a valid email address.";
    if (joinPassword.length < 6) nextErrors.password = "Password must be at least 6 characters.";
    if (joinCategory === "STUDENT" && !joinForm.studentId.trim()) nextErrors.studentId = "Student ID number is required.";
    if (joinCategory === "STUDENT" && !joinForm.institution.trim()) nextErrors.institution = "Institution name is required.";
    if (joinCategory === "STUDENT" && studentPlansState !== "ready") nextErrors.plan = "Student plans are not available yet. Reload plans and try again.";
    setJoinErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const plan = plansForCategory.find(p => p.id === selectedPlan) ?? plansForCategory[0];
    if (!plan) {
      setJoinErrors({ plan: "No database-configured membership plan is available for this category." });
      return;
    }
    setIsJoining(true);
    try {
      const registered = await registerCustomer({
        email: joinForm.email.trim(), password: joinPassword, fullName: joinForm.name.trim(), phone: joinForm.phone.trim(),
        planId: plan.id, planName: plan.name, planPrice: plan.price, durationDays: plan.durationDays,
        category: joinCategory, studentId: joinForm.studentId.trim(), institution: joinForm.institution.trim(),
      });
      const newMember: Member = {
        id: registered.id,
        name: joinForm.name,
        phone: joinForm.phone,
        email: joinForm.email,
        memberId: registered.customerCode,
        planId: plan.id,
        joinDate: new Date().toISOString().split("T")[0],
        expiryDate: joinCategory === "STUDENT" ? "" : new Date(Date.now() + plan.durationDays * 86400000).toISOString().split("T")[0],
        status: joinCategory === "STUDENT" ? "inactive" : "active",
        lastVisit: null,
        emergencyContact: "",
        emergencyPhone: "",
        medicalNotes: "",
        emailNotifications: true,
        balanceDue: 0,
        category: joinCategory,
        studentId: joinCategory === "STUDENT" ? joinForm.studentId : undefined,
        institution: joinCategory === "STUDENT" ? joinForm.institution : undefined,
        studentVerified: false,
      };
      if (registered.sessionCreated) await onJoin(newMember);
      if (registered.sessionCreated && joinCategory !== "STUDENT") {
        sendEmail(state, dispatch, joinForm.email, joinForm.name, "Welcome to Power Plus Gym!", `Hi ${joinForm.name}, your ${plan.name} membership (${categoryLabelOf(state, joinCategory)} category) is active until ${newMember.expiryDate}.`, "welcome");
      }
      toast.success(!registered.sessionCreated
        ? "Account created. Check your email to confirm it, then sign in to open your member dashboard."
        : joinCategory === "STUDENT"
        ? `Student account created. Show your student ID at reception for verification; membership activates only after verification and payment are complete.`
        : registered.membershipCreated
          ? `Welcome ${joinForm.name}! Your ${plan.name} membership is active.`
          : `Welcome ${joinForm.name}! Your customer account was created; membership setup is pending.`);
      setShowJoinModal(false);
      setJoinForm({ name: "", phone: "", email: "", studentId: "", institution: "" });
      setJoinPassword("");
      setJoinErrors({});
    } catch (cause) {
      console.error("Join Us registration failed", cause);
      toast.error(cause instanceof Error ? cause.message : "Registration failed. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleContact = async () => {
    if (!contactForm.name.trim()) {
      toast.error("Please enter your name.");
      return;
    }
    if (!contactForm.phone.trim()) {
      toast.error("Please enter your phone number.");
      return;
    }
    if (!isValidPhoneNumber(contactForm.phone)) {
      toast.error("Please enter a valid phone number (e.g., 0911 234 567 or +251 911 234 567).");
      return;
    }
    if (!contactForm.message.trim()) {
      toast.error("Please enter your message.");
      return;
    }

    setIsSubmittingContact(true);
    try {
      await submitContactMessage({
        name: contactForm.name,
        phone: contactForm.phone,
        message: contactForm.message,
      });
      toast.success("Thank you! Your message has been received. Our team will contact you shortly.");
      setContactForm({ name: "", phone: "", message: "" });
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Failed to submit message. Please try again.");
    } finally {
      setIsSubmittingContact(false);
    }
  };

  const stats = [
    {
      label: "Active members",
      value: liveActiveMembers !== null ? liveActiveMembers : state.members.filter(m => m.status === "active").length,
      icon: Users,
    },
    {
      label: "Certified coaches",
      value: "6+",
      icon: Star,
    },
    {
      label: "Equipment units",
      value: "50+",
      icon: Barbell,
    },
    {
      label: "Years of excellence",
      value: "8+",
      icon: ShieldCheck,
    },
  ];

  const facilities = [
    { name: "Free-weights zone", desc: "Olympic bars, dumbbells up to 60 kg, squat racks", icon: Barbell },
    { name: "Cardio floor", desc: "Treadmills, bikes and rowers with entertainment screens", icon: Flame },
    { name: "Group classes", desc: "HIIT, spin, yoga and CrossFit every single day", icon: Users },
    { name: "Recovery area", desc: "Sauna, steam room and cold plunge", icon: Heart },
    { name: "Personal coaching", desc: "Certified coaches building tailor-made programs", icon: Star },
    { name: "Nutrition bar", desc: "Protein shakes, prepared meals and supplements", icon: Lightning },
  ];

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white">
      {/* Hero */}
      <section className="relative overflow-hidden pt-16 sm:pt-20 pb-16 sm:pb-24 px-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(163,230,53,0.08),transparent_60%)]" />
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <span className="inline-flex items-center gap-2 bg-lime-400/10 border border-lime-400/20 rounded-full px-4 py-1.5 text-lime-400 text-xs sm:text-sm font-medium mb-6">
              <Lightning weight="fill" className="w-4 h-4" /> Addis Ababa's #1 gym
            </span>
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-4">
              {state.settings.tagline ? (
                <>
                  {state.settings.tagline.split(".")[0] || "Train strong"}.<br />
                  <span className="text-lime-400">
                    {state.settings.tagline.split(".")[1]?.trim() || "Stay strong."}
                  </span>
                </>
              ) : (
                <>
                  Train strong.<br />
                  <span className="text-lime-400">Stay strong.</span>
                </>
              )}
            </h1>
            <p className="text-zinc-400 text-sm sm:text-lg md:text-xl max-w-2xl mx-auto mb-8 px-2">
              {state.settings.description || "A premium gym with world-class equipment, expert coaches and a community that pushes you further."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center max-w-md sm:max-w-none mx-auto">
              <button onClick={() => setShowJoinModal(true)} className="bg-lime-400 text-zinc-950 font-bold px-8 py-3.5 sm:py-4 rounded-xl hover:bg-lime-300 transition-colors text-base sm:text-lg active:scale-[0.98]">
                Join now
              </button>
              <a href="#plans" className="border border-zinc-700 text-white font-semibold px-8 py-3.5 sm:py-4 rounded-xl hover:border-lime-400/50 transition-colors text-base sm:text-lg text-center active:scale-[0.98]">
                See memberships
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats - Monthly Revenue completely removed, Active Members connected to Supabase */}
      <section className="border-y border-zinc-800/50 bg-zinc-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 py-8 sm:py-12 px-4">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center p-2">
              <s.icon weight="fill" className="w-7 h-7 sm:w-8 sm:h-8 text-lime-400 mx-auto mb-2" />
              <div className="text-2xl sm:text-3xl font-black text-white">{s.value}</div>
              <div className="text-xs sm:text-sm text-zinc-400 font-medium mt-0.5">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Training floor showcase - "Where the Work Happens" */}
      <section id="about" className="scroll-mt-24 py-12 sm:py-16 md:py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-3xl overflow-hidden border border-zinc-800 bg-zinc-900 min-h-[19rem] sm:min-h-[24rem] md:min-h-[28rem] flex flex-col justify-end shadow-2xl"
          >
            <img
              src={showcaseImgSrc}
              onError={() => {
                if (showcaseImgSrc === LOCAL_SHOWCASE_IMAGE) {
                  setShowcaseImgSrc(FALLBACK_SHOWCASE_IMAGE);
                }
              }}
              alt="Inside the Power Plus Gym training floor"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/65 to-black/25 pointer-events-none" />
            <div className="relative z-10 flex flex-col justify-end p-5 sm:p-8 md:p-10 max-w-2xl">
              <span className="text-xs font-bold uppercase tracking-widest text-lime-400">Inside the club</span>
              <h3 className="text-2xl sm:text-3xl md:text-5xl font-black uppercase tracking-tight mt-2 text-white">
                Where the work happens
              </h3>
              <p className="text-zinc-200 text-xs sm:text-sm md:text-base mt-2 leading-relaxed">
                Real iron, real coaching, real results — every session on our floor is built to move you forward.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Facilities Bento Grid */}
      <section id="facilities" className="scroll-mt-24 py-12 sm:py-16 md:py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight mb-3">World-class facilities</h2>
          <p className="text-zinc-400 mb-8 sm:mb-12 max-w-lg text-sm sm:text-base">Everything you need to train at the top of your game, all under one roof.</p>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 items-stretch">
            {facilities.map((f, i) => (
              <motion.div key={f.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 hover:border-lime-400/30 transition-colors group">
                <f.icon weight="fill" className="w-8 h-8 sm:w-10 sm:h-10 text-lime-400 mb-3 sm:mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-lg sm:text-xl font-bold mb-1.5 sm:mb-2">{f.name}</h3>
                <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Memberships - Real Supabase Plans & Dynamic Categories */}
      <section id="plans" className="scroll-mt-24 py-16 sm:py-24 px-4 bg-zinc-900/30">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight mb-2 text-center">Our memberships</h2>
          <p className="text-zinc-400 mb-6 text-center text-sm sm:text-base">
            Showing membership plans for <span className="text-lime-400 font-bold">{categoryLabelOf(state, selectedCategory)}</span>
          </p>

          {/* Dynamic Category Filter Pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-10 sm:mb-12">
            {visibleCategories.map(cat => {
              const isActive = selectedCategory === cat.category;
              return (
                <button
                  key={cat.category}
                  onClick={() => handleCategorySelect(cat.category)}
                  className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-lime-400 text-zinc-950 font-bold shadow-md shadow-lime-400/20"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Loading, Error, Empty, and Success States */}
          {isPlansLoading ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="w-10 h-10 border-4 border-lime-400/20 border-t-lime-400 rounded-full animate-spin mb-4" />
              <p className="text-sm text-zinc-400">Loading membership plans...</p>
            </div>
          ) : plansLoadError && displayedPlans.length === 0 ? (
            <div className="text-center py-16 px-6 max-w-md mx-auto bg-zinc-900 border border-red-500/30 rounded-2xl">
              <ShieldCheck weight="fill" className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">Unable to Load Plans</h3>
              <p className="text-sm text-zinc-400 mb-6">{plansLoadError}</p>
              <button
                onClick={() => void loadPublicData()}
                className="bg-lime-400 text-zinc-950 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-lime-300 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : displayedPlans.length === 0 ? (
            <div className="text-center py-16 px-6 max-w-md mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl">
              <Sparkle weight="fill" className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">No membership plans are currently available in this category.</h3>
              <p className="text-sm text-zinc-400 mb-6">
                Plans tailored for {categoryLabelOf(state, selectedCategory)} will appear here once configured by the admin.
              </p>
              {visibleCategories.length > 0 && selectedCategory !== visibleCategories[0].category && (
                <button
                  onClick={() => handleCategorySelect(visibleCategories[0].category)}
                  className="bg-lime-400 text-zinc-950 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-lime-300 transition-colors"
                >
                  View {visibleCategories[0].label} Plans
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-stretch">
              {displayedPlans.map((plan, i) => (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className={`relative rounded-2xl p-6 border flex flex-col justify-between ${
                    i === 0
                      ? "border-lime-400 bg-zinc-900 shadow-lg shadow-lime-400/5"
                      : "border-zinc-800 bg-zinc-950"
                  }`}
                >
                  {i === 0 && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-lime-400 text-zinc-950 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      Featured
                    </span>
                  )}
                  <div>
                    <h3 className="text-lg font-bold mb-1 text-white">{plan.name}</h3>
                    <div className="text-3xl font-black text-lime-400 mb-1">{formatETB(plan.price)}</div>
                    <div className="text-sm text-zinc-400 mb-2 font-medium">{plan.durationDays} days of gym access</div>
                    {plan.description && (
                      <p className="text-xs text-zinc-400 mb-3 italic">{plan.description}</p>
                    )}
                    <div className="text-xs text-lime-400/90 mb-4 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {planCategoryText(state, plan)}
                    </div>
                    {plan.perks && plan.perks.length > 0 && (
                      <ul className="space-y-2 mb-6">
                        {plan.perks.map(perk => (
                          <li key={perk} className="flex items-start gap-2 text-xs sm:text-sm text-zinc-300">
                            <CheckCircle weight="fill" className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                            <span>{perk}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Purely Informational Footer Badge - 'Choose this plan' button REMOVED */}
                  <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-lime-400 font-semibold">
                      <ShieldCheck weight="fill" className="w-4 h-4 text-lime-400" />
                      Verified Plan
                    </span>
                    <span className="text-zinc-500 font-mono text-[11px]">
                      Available at Gym
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contact - Live Supabase Gym Settings Connected */}
      <section id="contact" className="scroll-mt-24 py-16 sm:py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-10 sm:mb-12 text-center">Get in touch</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <MapPin weight="fill" className="w-6 h-6 text-lime-400 mt-1 shrink-0" />
                <div>
                  <div className="font-bold text-white">Address</div>
                  <div className="text-zinc-400 text-sm mt-0.5">{state.settings.address}</div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Phone weight="fill" className="w-6 h-6 text-lime-400 mt-1 shrink-0" />
                <div>
                  <div className="font-bold text-white">Phone</div>
                  <div className="text-zinc-400 text-sm mt-0.5">{state.settings.phone}</div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Envelope weight="fill" className="w-6 h-6 text-lime-400 mt-1 shrink-0" />
                <div>
                  <div className="font-bold text-white">E-mail</div>
                  <div className="text-zinc-400 text-sm mt-0.5">{state.settings.email}</div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Clock weight="fill" className="w-6 h-6 text-lime-400 mt-1 shrink-0" />
                <div>
                  <div className="font-bold text-white">Opening hours</div>
                  <div className="text-zinc-400 text-sm mt-0.5 whitespace-pre-line leading-relaxed">
                    {state.settings.operatingHours || "Monday to Saturday: 05:00 AM – 11:00 PM\nSunday: 06:00 AM – 09:00 PM"}
                  </div>
                </div>
              </div>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void handleContact(); }} className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 font-semibold block mb-1">Your Name *</label>
                <input
                  type="text"
                  value={contactForm.name}
                  onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                  placeholder="e.g. Abebe Kebede"
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:border-lime-400/50 focus:outline-none text-sm transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 font-semibold block mb-1">Phone Number *</label>
                <input
                  type="tel"
                  value={contactForm.phone}
                  onChange={e => setContactForm({ ...contactForm, phone: e.target.value })}
                  placeholder="e.g. 0911 234 567 or +251 911 234 567"
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:border-lime-400/50 focus:outline-none text-sm font-mono transition-colors"
                />
                <p className="text-[11px] text-zinc-500 mt-1">Our team will call this number to answer your inquiry.</p>
              </div>

              <div>
                <label className="text-xs text-zinc-400 font-semibold block mb-1">Your Message *</label>
                <textarea
                  value={contactForm.message}
                  onChange={e => setContactForm({ ...contactForm, message: e.target.value })}
                  placeholder="How can we assist you? Tell us about memberships, personal training, or hours..."
                  required
                  rows={4}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:border-lime-400/50 focus:outline-none resize-none text-sm leading-relaxed transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingContact}
                className="w-full bg-lime-400 text-zinc-950 font-bold py-3.5 rounded-xl hover:bg-lime-300 transition-colors active:scale-[0.98] text-sm cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSubmittingContact ? (
                  <>
                    <div className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                    <span>Sending message...</span>
                  </>
                ) : (
                  <span>Send message</span>
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 pt-12 pb-8 px-4 bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <Barbell weight="fill" className="w-7 h-7 text-lime-400" />
                <span className="font-black text-xl uppercase tracking-tight text-white">{state.settings.gymName}</span>
              </div>
              <p className="text-lime-400 text-xs font-bold uppercase tracking-widest">Train Strong. Stay Strong.</p>
              <p className="text-zinc-400 text-xs sm:text-sm max-w-sm leading-relaxed">
                {state.settings.description || "Addis Ababa's premier athletic fitness center and health club, powered by professional coaching and modern strength facilities."}
              </p>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-3">Quick Links</h4>
              <ul className="space-y-2 text-xs sm:text-sm text-zinc-400">
                <li><a href="#plans" className="hover:text-lime-400 transition-colors">Membership Plans</a></li>
                <li><a href="#facilities" className="hover:text-lime-400 transition-colors">Gym Facilities</a></li>
                <li><a href="#about" className="hover:text-lime-400 transition-colors">About Our Floor</a></li>
                <li><a href="#contact" className="hover:text-lime-400 transition-colors">Contact & Hours</a></li>
                <li><a href="/login" className="text-lime-400 hover:underline font-semibold">Member & Staff Login &rarr;</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-3">Visit & Connect</h4>
              <ul className="space-y-2 text-xs sm:text-sm text-zinc-400">
                <li><span className="text-zinc-500 block text-[11px]">Location</span>{state.settings.address}</li>
                <li><span className="text-zinc-500 block text-[11px]">Phone</span><a href={`tel:${state.settings.phone.replace(/[^0-9+]/g, "")}`} className="hover:text-lime-400 font-mono">{state.settings.phone}</a></li>
                <li><span className="text-zinc-500 block text-[11px]">Email</span><a href={`mailto:${state.settings.email}`} className="hover:text-lime-400">{state.settings.email}</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-zinc-900 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-zinc-500 text-xs">
            <p>&copy; {new Date().getFullYear()} {state.settings.gymName}. All rights reserved.</p>
            <p className="text-zinc-600 font-mono text-[11px]">Addis Ababa, Ethiopia</p>
          </div>
        </div>
      </footer>

      {/* Join Modal */}
      <AnimatePresence>
        {showJoinModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowJoinModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h3 className="text-2xl font-black uppercase mb-2">Join {state.settings.gymName}</h3>
              <p className="text-sm text-zinc-500 mb-6">Choose your category: the plans shown adapt automatically.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-500 block mb-2">Member category</label>
                  <div className="grid grid-cols-2 gap-2">
                    {state.categoryLabels.map(cat => (
                      <button key={cat.category} type="button" onClick={() => selectCategory(cat.category)} className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${joinCategory === cat.category ? "bg-lime-400 text-zinc-950 border-lime-400" : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-lime-400/40"}`}>{cat.label}</button>
                    ))}
                  </div>
                </div>
                <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)} disabled={joinCategory === "STUDENT" && studentPlansState !== "ready"} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-lime-400/50">
                  {joinCategory === "STUDENT" && studentPlansState === "loading" && <option value="">Loading Student plans…</option>}
                  {joinCategory === "STUDENT" && studentPlansState === "ready" && !plansForCategory.length && <option value="">No Student plans are configured</option>}
                  {plansForCategory.map(p => <option key={p.id} value={p.id}>{p.name} · {p.durationDays} days · {formatETB(p.price)}{p.perks.length ? ` · ${p.perks.join(", ")}` : ""}</option>)}
                </select>
                {joinErrors.plan && <p className="text-xs text-red-400">{joinErrors.plan}</p>}
                {joinCategory === "STUDENT" && studentPlansState === "error" && <p className="text-xs text-red-400">Student plans could not be loaded. {studentPlansError} <button type="button" onClick={() => void selectCategory("STUDENT")} className="underline focus-visible:outline focus-visible:outline-lime-400">Retry</button></p>}
                <div><input aria-label="Full name" aria-invalid={!!joinErrors.name} value={joinForm.name} onChange={e => setJoinForm({ ...joinForm, name: e.target.value })} placeholder="Full name" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />{joinErrors.name && <p className="text-xs text-red-400 mt-1">{joinErrors.name}</p>}</div>
                <div><input aria-label="Phone number" aria-invalid={!!joinErrors.phone} value={joinForm.phone} onChange={e => setJoinForm({ ...joinForm, phone: e.target.value })} placeholder="Phone number" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />{joinErrors.phone && <p className="text-xs text-red-400 mt-1">{joinErrors.phone}</p>}</div>
                <div><input type="email" aria-label="Email address" aria-invalid={!!joinErrors.email} value={joinForm.email} onChange={e => setJoinForm({ ...joinForm, email: e.target.value })} placeholder="E-mail address" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />{joinErrors.email && <p className="text-xs text-red-400 mt-1">{joinErrors.email}</p>}</div>
                <div><input type="password" aria-label="Password" aria-invalid={!!joinErrors.password} value={joinPassword} onChange={e => setJoinPassword(e.target.value)} placeholder="Password (min. 6 characters)" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />{joinErrors.password && <p className="text-xs text-red-400 mt-1">{joinErrors.password}</p>}</div>
                {joinCategory === "STUDENT" && (
                  <div className="space-y-3 border border-blue-400/30 bg-blue-400/5 rounded-xl p-3">
                    <p className="text-xs text-blue-400">Student proof required — verified at reception before the reduced rate is activated.</p>
                    <input value={joinForm.studentId} onChange={e => setJoinForm({ ...joinForm, studentId: e.target.value })} placeholder="Student ID number *" aria-label="Student ID number" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
                    {joinErrors.studentId && <p className="text-xs text-red-400">{joinErrors.studentId}</p>}
                    <input value={joinForm.institution} onChange={e => setJoinForm({ ...joinForm, institution: e.target.value })} placeholder="Institution *" aria-label="Institution" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-lime-400/50" />
                    {joinErrors.institution && <p className="text-xs text-red-400">{joinErrors.institution}</p>}
                  </div>
                )}
                <button onClick={() => void handleJoin()} disabled={isJoining} className="w-full bg-lime-400 text-zinc-950 font-bold py-3 rounded-xl hover:bg-lime-300 transition-colors active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60">
                  {isJoining ? "Creating your account..." : "Complete my sign-up"} {!isJoining && <ArrowRight weight="bold" className="w-5 h-5" />}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

