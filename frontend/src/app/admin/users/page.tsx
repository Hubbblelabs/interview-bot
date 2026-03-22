"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { AdminUser } from "@/types";
import { Users, Trash2, Search } from "lucide-react";

export default function AdminUsersPage() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const pageSize = 10;

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/users?limit=500");
      setItems(data.items || []);
    } catch (err) {
      console.error("Failed to fetch users", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (user) =>
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
    );
  }, [items, query]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visibleItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);

  const removeUser = async (user: AdminUser) => {
    const confirmed = confirm(`Delete user ${user.name} (${user.email})? This will remove related sessions/reports.`);
    if (!confirmed) return;

    setDeletingUserId(user.id);
    try {
      await api.delete(`/admin/users/${user.id}`);
      setItems((prev) => prev.filter((item) => item.id !== user.id));
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to delete user");
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <ProtectedRoute requiredRole="admin">
      <Navbar />
      <main className="pt-20 md:pt-8 pb-12 px-4 max-w-6xl mx-auto md:ml-[var(--admin-sidebar-width,250px)]">
        <div className="animate-fade-in space-y-6">
          <section className="rounded-2xl border border-border bg-gradient-to-br from-card to-black/40 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-6 h-6" />
              <h1 className="text-2xl font-bold">User Management</h1>
            </div>
            <p className="text-sm text-muted">View all registered users and remove accounts when required.</p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email"
                className="w-full pl-9"
              />
            </div>
          </section>

          {loading ? (
            <div className="text-center text-muted mt-12 animate-pulse-slow">Loading users...</div>
          ) : filteredItems.length === 0 ? (
            <section className="rounded-2xl border border-border bg-card p-10 text-center">
              <p className="text-muted">No users found.</p>
            </section>
          ) : (
            <section className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-white/5 text-muted">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Name</th>
                      <th className="text-left px-4 py-3 font-medium">Email</th>
                      <th className="text-left px-4 py-3 font-medium">Joined</th>
                      <th className="text-left px-4 py-3 font-medium">Interviews</th>
                      <th className="text-left px-4 py-3 font-medium">Reports</th>
                      <th className="text-right px-4 py-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((user) => (
                      <tr key={user.id} className="border-t border-border/70">
                        <td className="px-4 py-3 font-medium">{user.name || "Unknown"}</td>
                        <td className="px-4 py-3 text-muted">{user.email}</td>
                        <td className="px-4 py-3 text-muted">{user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}</td>
                        <td className="px-4 py-3">{user.interview_count}</td>
                        <td className="px-4 py-3">{user.report_count}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => removeUser(user)}
                            disabled={deletingUserId === user.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 border-t border-border/70 flex items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredItems.length)} of {filteredItems.length}
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
            </section>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
