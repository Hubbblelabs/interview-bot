"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import {
  warmupSpeechVoices,
  unlockSpeechPlayback,
  prefetchSpeech,
  prepareSpeech,
  SpeechVoiceGender,
} from "@/lib/speech";
import {
  Profile,
  ReportHistoryItem,
  JobRole,
  Topic,
  JobDescription,
  JobDescriptionAlignment,
} from "@/types";
import {
  FileText,
  AlertCircle,
  Clock,
  ChevronRight,
  Loader2,
  Download,
} from "lucide-react";
import { PageSkeleton } from "@/components/Skeleton";

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [jobDescriptions, setJobDescriptions] = useState<JobDescription[]>([]);
  const [selectedRoleInput, setSelectedRoleInput] = useState("");
  const [interviewMode, setInterviewMode] = useState<"resume" | "topic">("resume");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [selectedJdId, setSelectedJdId] = useState("");
  const [loading, setLoading] = useState(true);
  const [isStartingInterview, setIsStartingInterview] = useState(false);
  const [startInterviewStatus, setStartInterviewStatus] = useState("Preparing your interview session...");
  const [verificationResult, setVerificationResult] = useState<JobDescriptionAlignment | null>(null);
  const [verificationSnapshot, setVerificationSnapshot] = useState<any | null>(null);
  const [isAutoVerifyingMatch, setIsAutoVerifyingMatch] = useState(false);
  const verificationRequestRef = useRef<Promise<any | null> | null>(null);
  const latestVerificationContextRef = useRef("");
  const didBootstrapRef = useRef(false);

  const getVerificationStorageKey = (userId: string) => `jd-verification-cache:${userId}`;

  const getVerificationComboKey = (jdId: string, resumeUploadedAt: string, jdUpdatedAt: string) =>
    `${jdId || ""}::${resumeUploadedAt || ""}::${jdUpdatedAt || ""}`;

  const selectedJdUpdatedAt =
    jobDescriptions.find((jd) => jd.id === selectedJdId)?.updated_at || "";
  const verificationCacheOwnerId =
    ((profile as any)?.id as string | undefined) ||
    ((profile as any)?.user_id as string | undefined) ||
    "";

  const getApiErrorMessage = (err: any, fallbackMessage: string) => {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;

    const rawDetail =
      typeof detail === "string"
        ? detail
        : typeof detail?.message === "string"
        ? detail.message
        : detail
        ? JSON.stringify(detail)
        : "";

    const normalized = rawDetail.toLowerCase();
    const isAiBusy =
      status === 503 ||
      normalized.includes("unavailable") ||
      normalized.includes("high demand") ||
      normalized.includes("resource_exhausted");

    if (isAiBusy) {
      return "AI service is currently busy. Please try again in a few seconds.";
    }

    return rawDetail || fallbackMessage;
  };

  useEffect(() => {
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;

    fetchDashboardData();
    void warmupSpeechVoices();
  }, []);

  useEffect(() => {
    setVerificationResult(null);
    setVerificationSnapshot(null);
  }, [selectedJdId]);

  useEffect(() => {
    if (!verificationSnapshot) return;
    const currentResumeUploadedAt = profile?.resume?.uploaded_at || "";
    const snapshotResumeUploadedAt = verificationSnapshot?.resume_snapshot?.uploaded_at || "";
    if (currentResumeUploadedAt && snapshotResumeUploadedAt && currentResumeUploadedAt !== snapshotResumeUploadedAt) {
      setVerificationResult(null);
      setVerificationSnapshot(null);
    }
  }, [profile?.resume?.uploaded_at, verificationSnapshot]);

  useEffect(() => {
    latestVerificationContextRef.current = `${interviewMode}::${selectedJdId || ""}::${
      profile?.resume?.uploaded_at || ""
    }::${selectedJdUpdatedAt || ""}`;
  }, [interviewMode, selectedJdId, profile?.resume?.uploaded_at, selectedJdUpdatedAt]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!verificationCacheOwnerId || !selectedJdId || !profile?.resume?.uploaded_at) return;
    if (verificationSnapshot || verificationResult) return;

    const storageKey = getVerificationStorageKey(verificationCacheOwnerId);
    const comboKey = getVerificationComboKey(
      selectedJdId,
      profile.resume.uploaded_at,
      selectedJdUpdatedAt
    );

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const cacheByCombo = parsed?.cacheByCombo || {};
      const entry = cacheByCombo[comboKey];
      if (!entry) return;
      setVerificationResult(entry?.result || null);
      setVerificationSnapshot(entry?.snapshot || null);
    } catch {
      // Ignore malformed local cache.
    }
  }, [
    verificationCacheOwnerId,
    profile?.resume?.uploaded_at,
    selectedJdId,
    selectedJdUpdatedAt,
    verificationSnapshot,
    verificationResult,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!verificationCacheOwnerId) return;

    const storageKey = getVerificationStorageKey(verificationCacheOwnerId);
    if (!verificationSnapshot || !verificationResult) {
      return;
    }

    const snapshotJdId = verificationSnapshot?.job_description?.id || selectedJdId || "";
    const snapshotResumeUploadedAt = verificationSnapshot?.resume_snapshot?.uploaded_at || "";
    const snapshotJdUpdatedAt = verificationSnapshot?.job_description?.updated_at || "";
    if (!snapshotJdId || !snapshotResumeUploadedAt) {
      return;
    }

    const comboKey = getVerificationComboKey(
      snapshotJdId,
      snapshotResumeUploadedAt,
      snapshotJdUpdatedAt
    );

    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const cacheByCombo = parsed?.cacheByCombo || {};
      cacheByCombo[comboKey] = {
        snapshot: verificationSnapshot,
        result: verificationResult,
        savedAt: verificationSnapshot?.saved_at || new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify({ cacheByCombo }));
    } catch {
      // Local cache is best-effort only.
    }
  }, [verificationCacheOwnerId, selectedJdId, verificationSnapshot, verificationResult]);

  const fetchDashboardData = async () => {
    try {
      const [profileRes, historyRes, rolesRes, topicsRes, jdRes] = await Promise.all([
        api.get("/profile"),
        api.get("/reports/history"),
        api.get("/admin/roles"),
        api.get("/admin/topics"),
        api.get("/profile/job-descriptions"),
      ]);
      setProfile(profileRes.data);
      setHistory(historyRes.data.reports || []);
      
      const availableRoles = rolesRes.data.roles || [];
      setRoles(availableRoles);
      const availableTopics = topicsRes.data.topics || [];
      setTopics(availableTopics);
      if (availableTopics.length > 0) {
        setSelectedTopicId(availableTopics[0].id);
      }

      const jdItems = jdRes.data.items || [];
      setJobDescriptions(jdItems);
      if (jdItems.length > 0) {
        setSelectedJdId(jdItems[0].id);
      }
      
      // Auto-populate input if there are recommended roles
      const recRoles = profileRes.data?.resume?.parsed_data?.recommended_roles;
      if (recRoles && recRoles.length > 0) {
        setSelectedRoleInput(recRoles[0]);
      } else if (availableRoles.length > 0) {
        setSelectedRoleInput(availableRoles[0].title);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  const buildResumeInterviewPayload = () => {
    const payload: any = {};
    if (selectedJdId) {
      payload.job_description_id = selectedJdId;
    }

    const matchingAdminRole = roles.find(
      (r) => r.title.toLowerCase() === selectedRoleInput.trim().toLowerCase()
    );

    if (matchingAdminRole) {
      payload.role_id = matchingAdminRole.id;
    } else {
      payload.custom_role = selectedRoleInput.trim();
    }

    return payload;
  };

  const verifyResumeMatchInternal = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (interviewMode !== "resume") {
      return null;
    }
    if (!profile?.resume || !selectedJdId) {
      return null;
    }

    if (verificationRequestRef.current) {
      return verificationRequestRef.current;
    }

    const requestContextKey = `${interviewMode}::${selectedJdId}::${
      profile?.resume?.uploaded_at || ""
    }::${selectedJdUpdatedAt || ""}`;

    const requestPromise = (async () => {
      if (silent) {
        setIsAutoVerifyingMatch(true);
      }

      try {
        const payload = buildResumeInterviewPayload();
        const { data } = await api.post("/interview/verify", payload);

        // Ignore stale response if role/JD/resume changed while request was in flight.
        if (latestVerificationContextRef.current !== requestContextKey) {
          return null;
        }

        setVerificationResult(data?.jd_alignment || null);
        setVerificationSnapshot(data || null);
        return data || null;
      } catch (err: any) {
        if (silent) {
          console.warn("Auto verification failed", err);
        } else {
          alert(getApiErrorMessage(err, "Failed to verify resume against job description"));
        }
        return null;
      } finally {
        if (silent) {
          setIsAutoVerifyingMatch(false);
        }
      }
    })();

    verificationRequestRef.current = requestPromise;
    try {
      return await requestPromise;
    } finally {
      verificationRequestRef.current = null;
    }
  };

  const downloadVerificationPdf = async () => {
    if (!verificationSnapshot || !verificationResult) {
      alert("Run Resume vs JD verification first.");
      return;
    }

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const maxWidth = pageWidth - margin * 2;
    let y = 46;

    const ensureSpace = (needed = 20) => {
      if (y + needed <= pageHeight - 40) return;
      doc.addPage();
      y = 46;
    };

    const addHeading = (text: string) => {
      ensureSpace(28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(text, margin, y);
      y += 24;
    };

    const addLabelValue = (label: string, value: string) => {
      const safeText = (value || "-").toString();
      const labelLines = doc.splitTextToSize(`${label}:`, maxWidth);
      const valueLines = doc.splitTextToSize(safeText, maxWidth);
      const blockHeight = labelLines.length * 13 + valueLines.length * 14 + 10;

      ensureSpace(blockHeight + 4);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(labelLines, margin, y);
      y += labelLines.length * 13 + 2;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(valueLines, margin, y);
      y += valueLines.length * 14 + 8;
    };

    const addList = (title: string, items: string[]) => {
      ensureSpace(22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(title, margin, y);
      y += 16;

      const values = (items || []).length ? items : ["-"];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      values.forEach((item) => {
        const lines = doc.splitTextToSize(`- ${item}`, maxWidth - 6);
        ensureSpace(lines.length * 14 + 8);
        doc.text(lines, margin + 6, y);
        y += lines.length * 14 + 2;
      });
      y += 6;
    };

    const jd = verificationSnapshot?.job_description || {};
    const resume = verificationSnapshot?.resume_snapshot || {};
    const parsed = resume?.parsed_data || {};
    const savedAt = verificationSnapshot?.saved_at || new Date().toISOString();

    addHeading("Resume vs Job Description Verification");
    addLabelValue("Verification ID", verificationSnapshot?.verification_id || "-");
    addLabelValue("Saved At", new Date(savedAt).toLocaleString());
    addLabelValue("Role", verificationSnapshot?.role_title || selectedRoleInput || "-");

    y += 6;
    addHeading("Job Description Snapshot");
    addLabelValue("JD Title", jd?.title || "-");
    addLabelValue("Company", jd?.company || "-");
    addLabelValue("Required Skills", (jd?.required_skills || []).join(", ") || "-");
    addLabelValue("JD Description", jd?.description || "-");

    y += 6;
    addHeading("Resume Snapshot");
    addLabelValue("Resume File", resume?.filename || profile?.resume?.filename || "-");
    addLabelValue("Candidate", parsed?.name || profile?.name || "-");
    addLabelValue("Email", parsed?.email || profile?.email || "-");
    addLabelValue("Phone", parsed?.phone || "-");
    addLabelValue("Location", parsed?.location || "-");
    addLabelValue("Extracted Skills", (resume?.skills || profile?.skills || []).join(", ") || "-");
    addLabelValue("Experience Summary", parsed?.experience_summary || "-");

    y += 6;
    addHeading("Alignment Result");
    addLabelValue("Fit Summary", verificationResult?.fit_summary || "-");
    addList("Meeting Expectations", verificationResult?.meeting_expectations || []);
    addList("Missing Expectations", verificationResult?.missing_expectations || []);
    addList("Improvement Suggestions", verificationResult?.improvement_suggestions || []);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    doc.save(`resume-jd-verification-${stamp}.pdf`);
  };

  const isVerificationFresh = () => {
    if (!verificationResult || !verificationSnapshot) {
      return false;
    }

    const snapshotJdId = verificationSnapshot?.job_description?.id || "";
    if (!selectedJdId || snapshotJdId !== selectedJdId) {
      return false;
    }

    const currentResumeUploadedAt = profile?.resume?.uploaded_at || "";
    const snapshotResumeUploadedAt = verificationSnapshot?.resume_snapshot?.uploaded_at || "";
    if (currentResumeUploadedAt && snapshotResumeUploadedAt && currentResumeUploadedAt !== snapshotResumeUploadedAt) {
      return false;
    }

    const currentJdUpdatedAt =
      jobDescriptions.find((jd) => jd.id === selectedJdId)?.updated_at || "";
    const snapshotJdUpdatedAt = verificationSnapshot?.job_description?.updated_at || "";
    if (currentJdUpdatedAt && currentJdUpdatedAt !== snapshotJdUpdatedAt) {
      return false;
    }

    return true;
  };

  useEffect(() => {
    if (interviewMode !== "resume") return;
    if (!profile?.resume || !selectedJdId) return;
    if (isStartingInterview || isAutoVerifyingMatch) return;
    if (isVerificationFresh()) return;

    const timer = setTimeout(() => {
      void verifyResumeMatchInternal({ silent: true });
    }, 450);

    return () => clearTimeout(timer);
  }, [
    interviewMode,
    profile?.resume?.uploaded_at,
    selectedJdId,
    selectedJdUpdatedAt,
    isStartingInterview,
    isAutoVerifyingMatch,
    verificationSnapshot,
    verificationResult,
  ]);

  const startInterview = async () => {
    if (interviewMode === "resume" && (!selectedRoleInput.trim() || !profile?.resume)) {
      alert("Please upload your resume first and select or type a job role.");
      return;
    }
    if (interviewMode === "resume" && !selectedJdId) {
      alert("Please select a Job Description before starting Resume Interview.");
      return;
    }
    if (interviewMode === "topic" && !selectedTopicId) {
      alert("Please select a topic for topic-wise interview.");
      return;
    }

    setIsStartingInterview(true);
    setStartInterviewStatus("Checking audio and preparing your interview setup...");
    try {
      // Called from button click gesture to improve media autoplay reliability.
      await unlockSpeechPlayback().catch(() => undefined);

      const payload: any = {
        interview_type: interviewMode,
      };
      let verifiedAlignment: any = verificationResult;

      if (interviewMode === "topic") {
        setStartInterviewStatus("Loading selected topic interview...");
        payload.topic_id = selectedTopicId;
      } else {
        // Reuse saved verification unless JD/resume changed.
        if (!isVerificationFresh()) {
          setStartInterviewStatus("Verifying resume against selected job description...");
          const verifyData = await verifyResumeMatchInternal({ silent: true });
          if (!verifyData) {
            throw new Error("Unable to verify resume against the selected job description");
          }
          verifiedAlignment = verifyData?.jd_alignment || null;
        }
        setStartInterviewStatus("Finalizing resume interview configuration...");
        Object.assign(payload, buildResumeInterviewPayload());
      }

      setStartInterviewStatus("Generating your first question...");
      const { data } = await api.post("/interview/start", payload);

      const preferredVoice =
        ((typeof window !== "undefined"
          ? (localStorage.getItem("speech_voice_gender") as SpeechVoiceGender | null)
          : null) ||
          (profile?.speech_settings?.voice_gender as SpeechVoiceGender | undefined) ||
          "female") as SpeechVoiceGender;

      prefetchSpeech(data?.question?.question || "", {
        voiceGender: preferredVoice,
        style: "assistant",
      });

      try {
        setStartInterviewStatus("Preloading first question audio...");
        await Promise.race([
          prepareSpeech(data?.question?.question || "", {
            voiceGender: preferredVoice,
            style: "assistant",
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("xtts prefetch timeout")), 25000)
          ),
        ]);
      } catch {
        // Continue to interview page; runtime speech fallback still applies.
      }

      const alignmentToStore = verifiedAlignment || data?.jd_alignment;
      if (typeof window !== "undefined" && alignmentToStore) {
        sessionStorage.setItem(`jd_alignment:${data.session_id}`, JSON.stringify(alignmentToStore));
      }
      const timerEnabled = !!data?.timer?.enabled;
      const timerSeconds = Number(data?.timer?.seconds || 0);
      const timerQuery =
        timerEnabled && timerSeconds > 0
          ? `&timerEnabled=1&timerSeconds=${timerSeconds}`
          : "";

      setStartInterviewStatus("Opening interview room...");
      router.push(
        `/interview?session=${data.session_id}&q=${encodeURIComponent(
          data.question.question
        )}&qid=${data.question.question_id}&num=${data.question.question_number}&diff=${
          data.question.difficulty
        }&total=${data.question.total_questions || 5}${timerQuery}`
      );
    } catch (err: any) {
      setIsStartingInterview(false);
      setStartInterviewStatus("Preparing your interview session...");
      alert(getApiErrorMessage(err, "Failed to start interview"));
    }
  };

  if (loading) {
    return (
      <ProtectedRoute requiredRole="student">
        <Navbar />
        <PageSkeleton />
      </ProtectedRoute>
    );
  }

  const avgScore =
    history.length > 0
      ? Math.round(history.reduce((acc, h) => acc + h.overall_score, 0) / history.length)
      : 0;

  return (
    <ProtectedRoute requiredRole="student">
      <Navbar />
      {isStartingInterview && (
        <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm px-4">
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-7 text-center shadow-2xl">
              <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Preparing your interview</h2>
              <p className="text-muted mb-4">{startInterviewStatus}</p>
              <p className="text-xs text-muted">
                Please keep this page open while we prepare questions and speech.
              </p>
            </div>
          </div>
        </div>
      )}
      <main className="pt-20 pb-12 px-4 max-w-7xl mx-auto">
        <div className="animate-fade-in">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              Welcome, {profile?.name?.split(" ")[0]}
            </h1>
            <p className="text-muted">Here's an overview of your interview progress.</p>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-6 rounded-xl bg-card border border-border flex items-center gap-4">
              <div className="p-3 bg-white/5 rounded-lg text-muted">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted mb-1">Total Interviews</p>
                <p className="text-2xl font-bold">{history.length}</p>
              </div>
            </div>
            <div className="p-6 rounded-xl bg-card border border-border flex items-center gap-4">
              <div className="w-1 h-14 rounded-full bg-amber-400/80" />
              <div className="flex-1">
                <p className="text-sm text-muted mb-1">Average Score</p>
                <p className="text-2xl font-bold tracking-tight">{avgScore}%</p>
              </div>
            </div>
            <div className="p-6 rounded-xl bg-card border border-border flex items-center gap-4">
              <div className={`w-1 h-14 rounded-full ${profile?.resume ? "bg-green-400/80" : "bg-rose-400/80"}`} />
              <div className="flex-1">
                <p className="text-sm text-muted mb-1">Resume Status</p>
                <p className={`text-xl font-bold ${profile?.resume ? "text-green-400" : "text-rose-400"}`}>
                  {profile?.resume ? "Uploaded" : "Missing"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)] gap-8">
            {/* Left Column */}
            <div className="space-y-8">
              {/* Action Banner */}
              {!profile?.resume ? (
                <div className="p-6 rounded-xl bg-blue-500/10 border border-blue-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-6 h-6 text-blue-400 shrink-0" />
                    <div>
                      <h3 className="font-semibold text-blue-400">Upload Your Resume</h3>
                      <p className="text-sm text-blue-400/80">
                        We use your resume to personalize your interview questions.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/settings"
                    className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    Go to Settings
                  </Link>
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-border bg-gradient-to-br from-card to-white/5">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-xl font-bold mb-2">Ready for a mock interview?</h2>
                      <p className="text-muted">
                        Choose Resume Interview or Topic Interview and start practicing.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setInterviewMode("resume")}
                        className={`px-3 py-1.5 rounded-lg text-sm border ${
                          interviewMode === "resume"
                            ? "bg-black text-white border-black"
                            : "bg-transparent text-muted border-border"
                        } cursor-pointer`}
                      >
                        Resume Interview
                      </button>
                      <button
                        onClick={() => setInterviewMode("topic")}
                        className={`px-3 py-1.5 rounded-lg text-sm border ${
                          interviewMode === "topic"
                            ? "bg-black text-white border-black"
                            : "bg-transparent text-muted border-border"
                        } cursor-pointer`}
                      >
                        Topic Interview
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-4 items-start">
                    {interviewMode === "resume" ? (
                      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-border bg-background/60 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted font-semibold mb-1">
                            Step 1: Choose Interview Role (Required)
                          </p>
                          <p className="text-xs text-muted mb-2">
                            Role is the position you are preparing for. It decides interview question direction.
                          </p>
                          <input
                            type="text"
                            list="roles-suggestions"
                            value={selectedRoleInput}
                            onChange={(e) => setSelectedRoleInput(e.target.value)}
                            placeholder="e.g. Frontend Developer"
                            className="w-full px-4 py-2.5 rounded-lg bg-background border border-border focus:outline-none focus:border-white transition-colors"
                          />
                          <datalist id="roles-suggestions">
                            {profile?.resume?.parsed_data?.recommended_roles?.map((role, i) => (
                              <option key={`rec-${i}`} value={role}>
                                Recommended by AI
                              </option>
                            ))}
                            {roles.map((r) => (
                              <option key={`admin-${r.id}`} value={r.title}>
                                Standard Role
                              </option>
                            ))}
                          </datalist>
                        </div>

                        <div className="rounded-lg border border-border bg-background/60 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted font-semibold mb-1">
                            Step 2: Choose Job Description - JD (Required)
                          </p>
                          <p className="text-xs text-muted mb-2">
                            JD is required for Resume Interview. Questions are restricted to JD required skills only.
                          </p>
                          <select
                            value={selectedJdId}
                            onChange={(e) => setSelectedJdId(e.target.value)}
                            className="w-full"
                          >
                            <option value="">Select Job Description</option>
                            {jobDescriptions.map((jd) => (
                              <option key={jd.id} value={jd.id}>
                                {jd.title}{jd.company ? ` - ${jd.company}` : ""}
                              </option>
                            ))}
                          </select>
                          {jobDescriptions.length === 0 && (
                            <p className="text-xs text-muted mt-2">
                              Add a job description in Settings to enable resume-vs-JD verification.
                            </p>
                          )}

                          <p className="text-[11px] text-muted mt-2">
                            Summary: Role sets interview context. JD required skills define what can be asked.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full rounded-lg border border-border bg-background/60 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted font-semibold mb-1">
                          Topic Interview
                        </p>
                        <p className="text-xs text-muted mb-2">
                          Pick one topic and practice only questions from that topic.
                        </p>
                        <select
                          value={selectedTopicId}
                          onChange={(e) => setSelectedTopicId(e.target.value)}
                          className="flex-1 w-full"
                        >
                          {topics.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="w-full rounded-lg border border-border bg-background/60 p-3 space-y-3 xl:sticky xl:top-24">
                      <p className="text-xs uppercase tracking-wide text-muted font-semibold">
                        Interview Actions
                      </p>
                      <button
                        onClick={startInterview}
                        disabled={isStartingInterview}
                        className="w-full px-6 py-2.5 bg-white text-black hover:bg-gray-100 hover:border-primary border border-transparent rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isStartingInterview ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Starting...
                          </>
                        ) : (
                          <>
                            Start Interview
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                      <p className="text-xs text-muted">
                        {interviewMode === "resume"
                          ? "Resume vs JD is checked automatically. It refreshes only when resume or JD changes."
                          : "Start directly to generate a focused topic interview."}
                      </p>
                    </div>
                  </div>

                  {interviewMode === "resume" && selectedJdId && !verificationResult && (
                    <p className="text-xs text-muted mt-3">
                      Resume vs JD comparison runs automatically and will appear here.
                    </p>
                  )}

                  {(isAutoVerifyingMatch || isStartingInterview) && (
                    <p className="text-xs text-muted mt-3">
                      {isStartingInterview
                        ? "Preparing your interview session. Please wait..."
                        : "Auto-checking your resume against the selected JD..."}
                    </p>
                  )}

                  {verificationResult && interviewMode === "resume" && (
                    <div className="mt-4 p-4 rounded-xl border border-border bg-background/50">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-sm font-semibold mb-1">Resume vs Job Description</h3>
                          <p className="text-sm text-muted">{verificationResult.fit_summary}</p>
                          {verificationSnapshot?.saved_at && (
                            <p className="text-xs text-muted mt-1">
                              Saved: {new Date(verificationSnapshot.saved_at).toLocaleString()}
                              {verificationSnapshot?.cached ? " - using saved comparison" : " - updated now"}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={downloadVerificationPdf}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-white/5 text-sm text-muted hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          Download PDF
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="font-semibold text-green-400 mb-1">Meeting</p>
                          <ul className="space-y-1 text-muted">
                            {verificationResult.meeting_expectations.slice(0, 4).map((item, idx) => (
                              <li key={`meet-${idx}`}>- {item}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold text-yellow-400 mb-1">Missing</p>
                          <ul className="space-y-1 text-muted">
                            {verificationResult.missing_expectations.slice(0, 4).map((item, idx) => (
                              <li key={`miss-${idx}`}>- {item}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold text-blue-400 mb-1">What Will Help</p>
                          <ul className="space-y-1 text-muted">
                            {verificationResult.improvement_suggestions.slice(0, 4).map((item, idx) => (
                              <li key={`help-${idx}`}>- {item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: History */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="font-semibold text-lg flex items-center gap-2 mb-3">
                  <Clock className="w-5 h-5" />
                  Recent Reports
                </h2>
                {history.length === 0 ? (
                  <div className="p-6 rounded-xl border border-border border-dashed text-center">
                    <p className="text-sm text-muted">No interviews completed yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.slice(0, 5).map((r) => (
                      <Link
                        href={`/report/${r.session_id}`}
                        key={r.session_id}
                        className="block p-4 rounded-xl bg-card border border-border hover:border-border-light transition-colors group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-medium text-sm group-hover:text-white transition-colors truncate pr-4">
                            {r.role_title || "Mock Interview"}
                          </h3>
                          <span
                            className={`text-sm font-bold shrink-0 ${
                              r.overall_score >= 70
                                ? "text-green-400"
                                : r.overall_score >= 40
                                ? "text-yellow-400"
                                : "text-red-400"
                            }`}
                          >
                            {r.overall_score}%
                          </span>
                        </div>
                        <p className="text-xs text-muted">
                          {new Date(r.completed_at).toLocaleDateString()}
                        </p>
                      </Link>
                    ))}
                    {history.length > 5 && (
                      <Link
                        href="/reports"
                        className="block text-center text-sm text-muted hover:text-white py-2"
                      >
                        View all reports →
                      </Link>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card/60 p-4">
                <h3 className="font-semibold mb-2">Interview Setup</h3>
                <p className="text-sm text-muted mb-2">
                  Resume mode asks JD-scoped questions only. Topic mode focuses on one selected area.
                </p>
                <p className="text-xs text-muted">
                  Tip: Resume-vs-JD comparison runs automatically and updates when JD or resume changes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
