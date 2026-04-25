"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { GroupTest, GroupTestResult } from "@/types";
import { Topic } from "@/types";
import {
  Layers,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function AdminGroupTestsPage() {
  const [items, setItems] = useState<GroupTest[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    topic_ids: [] as string[],
    time_limit_minutes: "",
    max_attempts: "1",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [groupRes, topicsRes] = await Promise.all([
        api.get("/admin/group-tests"),
        api.get("/admin/topics"),
      ]);
      setItems(groupRes.data.items || []);
      setTopics(topicsRes.data.topics || []);
    } catch (err) {
      console.error("Failed to load data", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setShowForm(false);
    setForm({ name: "", description: "", topic_ids: [], time_limit_minutes: "", max_attempts: "1" });
  };

  const editItem = (item: GroupTest) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description || "",
      topic_ids: item.topic_ids || [],
      time_limit_minutes: item.time_limit_minutes ? String(item.time_limit_minutes) : "",
      max_attempts: String(item.max_attempts ?? 1),
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleTopicSelection = (topicId: string) => {
    setForm((prev) => ({
      ...prev,
      topic_ids: prev.topic_ids.includes(topicId)
        ? prev.topic_ids.filter((id) => id !== topicId)
        : [...prev.topic_ids, topicId],
    }));
  };

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Group test name is required");
      return;
    }
    if (form.topic_ids.length === 0) {
      toast.error("Select at least one topic");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      topic_ids: form.topic_ids,
      time_limit_minutes: form.time_limit_minutes ? parseInt(form.time_limit_minutes) : null,
      max_attempts: parseInt(form.max_attempts) || 1,
    };

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/admin/group-tests/${editingId}`, payload);
        toast.success("Group test updated");
      } else {
        await api.post("/admin/group-tests", payload);
        toast.success("Group test created");
      }
      resetForm();
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to save group test");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = (id: string, name: string) => {
    toast(`Delete "${name}"?`, {
      description: "All student results for this group test will remain but the test won't be accessible.",
      action: {
        label: "Delete",
        onClick: async () => {
          try {
            await api.delete(`/admin/group-tests/${id}`);
            if (editingId === id) resetForm();
            fetchData();
          } catch (err: any) {
            toast.error(err.response?.data?.detail || "Failed to delete");
          }
        },
      },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  };

  const togglePublish = async (item: GroupTest) => {
    try {
      await api.patch(`/admin/group-tests/${item.id}/publish`, {
        is_published: !item.is_published,
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to update visibility");
    }
  };

  const scoreColor = (s: number) =>
    s >= 70 ? "text-green-400" : s >= 40 ? "text-yellow-400" : "text-red-400";

  return (
    <ProtectedRoute requiredRole="admin">
      <Navbar />
      <main className="pt-20 md:pt-8 pb-12 px-4 max-w-5xl mx-auto md:ml-[var(--admin-sidebar-width,250px)]">
        <div className="animate-fade-in">
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <Layers className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Group Tests</h1>
            </div>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-gray-200"
              >
                <Plus className="w-4 h-4" />
                New Group Test
              </button>
            )}
          </div>

          {/* ── Form ── */}
          {showForm && (
            <div className="app-panel mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">{editingId ? "Edit Group Test" : "New Group Test"}</h2>
                <button onClick={resetForm} className="text-muted hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={saveItem} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    placeholder="Group test name *"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="app-control"
                  />
                  <input
                    placeholder="Description (optional)"
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    className="app-control"
                  />
                  <div>
                    <label className="text-xs text-muted mb-1 block">Time limit per topic (minutes, blank = no limit)</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 30"
                      value={form.time_limit_minutes}
                      onChange={(e) => setForm((p) => ({ ...p, time_limit_minutes: e.target.value }))}
                      className="app-control"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Max attempts per student</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 2"
                      value={form.max_attempts}
                      onChange={(e) => setForm((p) => ({ ...p, max_attempts: e.target.value }))}
                      className="app-control"
                    />
                  </div>
                </div>

                {/* Topic selector */}
                <div>
                  <p className="text-xs text-muted mb-2">
                    Select topics *{" "}
                    <span className="text-amber-400">(topics must already exist)</span>
                  </p>
                  {topics.length === 0 ? (
                    <p className="text-sm text-muted">
                      No topics found.{" "}
                      <a href="/admin/topics" className="text-primary underline">
                        Create topics first.
                      </a>
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {topics.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTopicSelection(t.id)}
                          className={`px-3 py-2 rounded-lg text-sm border transition-all text-left ${
                            form.topic_ids.includes(t.id)
                              ? "bg-primary text-white border-primary"
                              : "bg-transparent text-muted border-border hover:border-primary/40"
                          }`}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {form.topic_ids.length > 0 && (
                    <p className="text-xs text-muted mt-2">
                      Selected: {form.topic_ids
                        .map((id) => topics.find((t) => t.id === id)?.name || id)
                        .join(", ")}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-gray-200 disabled:opacity-40 inline-flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingId ? "Update" : "Create"}
                  </button>
                  <button type="button" onClick={resetForm} className="app-btn">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── List ── */}
          {loading ? (
            <div className="text-sm text-muted">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted">No group tests yet. Create one above.</div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="app-panel">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{item.name}</p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${
                            item.is_published
                              ? "border-green-500/40 text-green-400 bg-green-500/8"
                              : "border-border text-muted bg-white/5"
                          }`}
                        >
                          {item.is_published ? "Published" : "Draft"}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted mt-1">{item.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(item.topics || []).map((t) => (
                          <span
                            key={t.id}
                            className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-muted mt-2">
                        {item.time_limit_minutes
                          ? `${item.time_limit_minutes} min/topic`
                          : "No time limit"}{" "}
                        · Max {item.max_attempts} attempt{item.max_attempts !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      <Link
                        href={`/admin/group-tests/${item.id}/results`}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-border text-xs text-muted hover:text-white hover:border-white/40"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        Results
                      </Link>
                      <button
                        onClick={() => togglePublish(item)}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs transition-all ${
                          item.is_published
                            ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                            : "border-green-500/40 text-green-400 hover:bg-green-500/10"
                        }`}
                      >
                        {item.is_published ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" /> Unpublish
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" /> Publish
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => editItem(item)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-border text-xs text-muted hover:text-white hover:border-white/40"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => deleteItem(item.id, item.name)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-red-500/40 text-red-400 text-xs hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
