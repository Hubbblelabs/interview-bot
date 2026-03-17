"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { AdminAnalytics } from "@/types";
import { Users, BarChart3, Award, TrendingDown, Activity } from "lucide-react";

export default function AdminDashboardPage() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const { data } = await api.get("/admin/analytics");
      setAnalytics(data);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute requiredRole="admin">
      <Navbar />
      <main className="pt-20 pb-12 px-4 max-w-6xl mx-auto">
        <div className="animate-fade-in">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Admin Dashboard</h1>
          <p className="text-muted mb-8">Monitor student performance and system analytics</p>

          {loading ? (
            <div className="text-center text-muted mt-12 animate-pulse-slow">Loading analytics...</div>
          ) : analytics ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="p-5 rounded-xl bg-card border border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-white/5">
                      <Users className="w-5 h-5 text-muted" />
                    </div>
                    <span className="text-sm text-muted">Total Students</span>
                  </div>
                  <p className="text-3xl font-bold">{analytics.total_students}</p>
                </div>
                <div className="p-5 rounded-xl bg-card border border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-white/5">
                      <Activity className="w-5 h-5 text-muted" />
                    </div>
                    <span className="text-sm text-muted">Total Interviews</span>
                  </div>
                  <p className="text-3xl font-bold">{analytics.total_interviews}</p>
                </div>
                <div className="p-5 rounded-xl bg-card border border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-white/5">
                      <BarChart3 className="w-5 h-5 text-muted" />
                    </div>
                    <span className="text-sm text-muted">Average Score</span>
                  </div>
                  <p className="text-3xl font-bold">{analytics.average_score}%</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-xl bg-card border border-border">
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="w-5 h-5 text-yellow-400" />
                    <h2 className="text-lg font-semibold">Top Performers</h2>
                  </div>
                  {analytics.top_performers.length === 0 ? (
                    <p className="text-sm text-muted">No data yet</p>
                  ) : (
                    <div className="space-y-3">
                      {analytics.top_performers.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-white/10 text-xs flex items-center justify-center font-bold">
                              {i + 1}
                            </span>
                            <div>
                              <p className="text-sm font-medium">{p.name}</p>
                              <p className="text-xs text-muted">{p.interview_count} interviews</p>
                            </div>
                          </div>
                          <span className="font-bold text-green-400">{p.avg_score}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-6 rounded-xl bg-card border border-border">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingDown className="w-5 h-5 text-red-400" />
                    <h2 className="text-lg font-semibold">Common Weak Areas</h2>
                  </div>
                  {analytics.common_weak_areas.length === 0 ? (
                    <p className="text-sm text-muted">No data yet</p>
                  ) : (
                    <div className="space-y-2">
                      {analytics.common_weak_areas.map((area, i) => (
                        <div
                          key={i}
                          className="px-4 py-3 rounded-lg bg-background border border-border text-sm"
                        >
                          {area}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted">Failed to load analytics.</p>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
