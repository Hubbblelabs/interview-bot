"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { ReportHistoryItem } from "@/types";
import { BarChart3, ChevronRight, FileText } from "lucide-react";
import { PageSkeleton } from "@/components/Skeleton";

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const { data } = await api.get("/reports/history");
      setReports(data.reports || []);
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute requiredRole="student">
      <Navbar />
      {loading ? (
        <PageSkeleton />
      ) : (
        <main className="pt-20 pb-12 px-4 max-w-4xl mx-auto">
          <div className="animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Interview Reports</h1>
            </div>

            {reports.length === 0 ? (
            <div className="text-center mt-16">
              <FileText className="w-12 h-12 text-muted mx-auto mb-4" />
              <p className="text-muted">No interview reports yet. Start your first interview!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <button
                  key={r.session_id}
                  onClick={() => router.push(`/report/${r.session_id}`)}
                  className="w-full p-5 rounded-xl bg-card border border-border hover:border-border-light transition-all text-left flex items-center justify-between group"
                >
                  <div>
                    <p className="font-semibold">{r.role_title || "Interview"}</p>
                    <p className="text-sm text-muted mt-1">
                      {new Date(r.completed_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}{" "}
                      • {r.total_questions} questions
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-2xl font-bold ${
                        r.overall_score >= 70
                          ? "text-green-400"
                          : r.overall_score >= 40
                          ? "text-yellow-400"
                          : "text-red-400"
                      }`}
                    >
                      {r.overall_score}%
                    </span>
                    <ChevronRight className="w-5 h-5 text-muted group-hover:text-white transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
      )}
    </ProtectedRoute>
  );
}
