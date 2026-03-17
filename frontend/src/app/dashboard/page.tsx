"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { Profile, ReportHistoryItem, JobRole } from "@/types";
import {
  FileText,
  AlertCircle,
  TrendingUp,
  Award,
  Clock,
  Briefcase,
  ChevronRight,
  Zap,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [profileRes, historyRes, rolesRes] = await Promise.all([
        api.get("/profile"),
        api.get("/reports/history"),
        api.get("/admin/roles"), // We can reuse this endpoint or make a specific public one
      ]);
      setProfile(profileRes.data);
      setHistory(historyRes.data.reports || []);
      
      const availableRoles = rolesRes.data.roles || [];
      setRoles(availableRoles);
      if (availableRoles.length > 0) {
        setSelectedRole(availableRoles[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  const startInterview = async () => {
    if (!selectedRole || !profile?.resume) {
      alert("Please upload your resume first and select a job role.");
      return;
    }
    try {
      const { data } = await api.post("/interview/start", {
        role_id: selectedRole,
        total_questions: 5,
      });
      router.push(
        `/interview?session=${data.session_id}&q=${encodeURIComponent(
          data.first_question.question
        )}&qid=${data.first_question.question_id}&num=${data.first_question.question_number}&diff=${
          data.first_question.difficulty
        }&total=5`
      );
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to start interview");
    }
  };

  if (loading) {
    return (
      <ProtectedRoute requiredRole="student">
        <Navbar />
        <main className="pt-20 px-4 max-w-7xl mx-auto h-screen flex justify-center mt-20">
          <div className="animate-pulse-slow text-muted">Loading dashboard...</div>
        </main>
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
      <main className="pt-20 pb-12 px-4 max-w-7xl mx-auto">
        <div className="animate-fade-in">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              Welcome back, {profile?.name?.split(" ")[0]}
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
              <div className="p-3 bg-white/5 rounded-lg text-yellow-400">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted mb-1">Average Score</p>
                <p className="text-2xl font-bold">{avgScore}%</p>
              </div>
            </div>
            <div className="p-6 rounded-xl bg-card border border-border flex items-center gap-4">
              <div className="p-3 bg-white/5 rounded-lg text-green-400">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted mb-1">Resume Status</p>
                <p className="text-xl font-bold text-green-400">
                  {profile?.resume ? "Uploaded" : "Missing"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-8">
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
                  <h2 className="text-xl font-bold mb-2">Ready for a mock interview?</h2>
                  <p className="text-muted mb-6">
                    Select a role to practice standard questions customized with your background.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="flex-1"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={startInterview}
                      className="w-full sm:w-auto px-6 py-2.5 bg-white text-black hover:bg-gray-200 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      Start Practice
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Skills */}
              {profile?.skills && profile.skills.length > 0 && (
                <div className="p-6 rounded-xl border border-border bg-card">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    <h2 className="font-semibold text-lg">Your Top Skills</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {profile.skills.map((skill, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: History */}
            <div className="space-y-4">
              <h2 className="font-semibold text-lg flex items-center gap-2">
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
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
