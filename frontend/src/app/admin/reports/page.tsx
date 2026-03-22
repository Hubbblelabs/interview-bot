"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { AdminReportSummary } from "@/types";
import { FileText, ChevronRight, BarChart3 } from "lucide-react";

export default function AdminReportsPage() {
  const [items, setItems] = useState<AdminReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const pageSize = 8;

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const { data } = await api.get("/admin/reports?limit=200");
      setItems(data.items || []);
    } catch (err) {
      console.error("Failed to fetch admin reports", err);
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 70) return "text-green-400";
    if (score >= 40) return "text-yellow-400";
    return "text-red-400";
  };

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const visibleItems = items.slice((page - 1) * pageSize, page * pageSize);

  return (
    <ProtectedRoute requiredRole="admin">
      <Navbar />
      <main className="pt-20 md:pt-8 pb-12 px-4 max-w-5xl mx-auto md:ml-[var(--admin-sidebar-width,250px)]">
        <div className="animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="w-6 h-6" />
            <h1 className="text-2xl font-bold">Interview Reports</h1>
          </div>

          {loading ? (
            <div className="text-center text-muted mt-12 animate-pulse-slow">Loading reports...</div>
          ) : items.length === 0 ? (
            <div className="text-center mt-16">
              <FileText className="w-12 h-12 text-muted mx-auto mb-4" />
              <p className="text-muted">No interview reports found yet.</p>
            </div>
          ) : (
            <div>
              <div className="space-y-3">
              {visibleItems.map((item) => (
                <Link
                  key={item.session_id}
                  href={`/admin/reports/${item.session_id}`}
                  className="block p-5 rounded-xl bg-card border border-border hover:border-white/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-lg mb-1">{item.user_name} ({item.user_email})</p>
                      <p className="text-sm text-muted">{item.role_title}</p>
                      <p className="text-xs text-muted mt-2">
                        {new Date(item.completed_at).toLocaleString()} • {item.total_questions} questions
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className={`text-2xl font-bold ${scoreColor(item.overall_score)}`}>{item.overall_score}%</span>
                      <ChevronRight className="w-5 h-5 text-muted" />
                    </div>
                  </div>
                </Link>
              ))}
              </div>
              <div className="mt-5 flex items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, items.length)} of {items.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="text-sm text-muted">{page}/{totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
