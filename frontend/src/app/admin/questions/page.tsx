"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { AdminQuestion, JobRole } from "@/types";
import { FileText, Plus, Pencil, Trash2, X, Filter } from "lucide-react";

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState("");

  const [roleId, setRoleId] = useState("");
  const [question, setQuestion] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [filterRole]);

  const fetchData = async () => {
    try {
      const [rolesRes] = await Promise.all([api.get("/admin/roles")]);
      setRoles(rolesRes.data.roles || []);
      await fetchQuestions();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestions = async () => {
    try {
      const params = filterRole ? `?role_id=${filterRole}` : "";
      const { data } = await api.get(`/admin/questions${params}`);
      setQuestions(data.questions || []);
    } catch (err) {
      console.error("Failed to fetch questions:", err);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setRoleId("");
    setQuestion("");
    setDifficulty("medium");
    setCategory("");
  };

  const handleEdit = (q: AdminQuestion) => {
    setEditingId(q.id);
    setRoleId(q.role_id);
    setQuestion(q.question);
    setDifficulty(q.difficulty);
    setCategory(q.category || "");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingId) {
        await api.put(`/admin/questions/${editingId}`, { question, difficulty, category });
      } else {
        await api.post("/admin/questions", {
          role_id: roleId,
          question,
          difficulty,
          category,
        });
      }
      resetForm();
      fetchQuestions();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to save question");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    try {
      await api.delete(`/admin/questions/${id}`);
      fetchQuestions();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to delete question");
    }
  };

  const difficultyColor = (d: string) => {
    switch (d) {
      case "easy": return "text-green-400 bg-green-500/10 border-green-500/20";
      case "medium": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      case "hard": return "text-red-400 bg-red-500/10 border-red-500/20";
      default: return "text-muted bg-white/5 border-border";
    }
  };

  return (
    <ProtectedRoute requiredRole="admin">
      <Navbar />
      <main className="pt-20 pb-12 px-4 max-w-4xl mx-auto">
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Question Bank</h1>
            </div>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="px-4 py-2 bg-white text-black rounded-lg font-semibold text-sm hover:bg-gray-200 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Question
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <Filter className="w-4 h-4 text-muted" />
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-48"
            >
              <option value="">All Roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </div>

          {showForm && (
            <div className="p-6 rounded-xl bg-card border border-border mb-6 animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">{editingId ? "Edit Question" : "New Question"}</h2>
                <button onClick={resetForm} className="text-muted hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                {!editingId && (
                  <select
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    required
                  >
                    <option value="">Select Role</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </select>
                )}
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Enter the interview question"
                  rows={3}
                  required
                  className="resize-none"
                />
                <div className="grid grid-cols-2 gap-4">
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Category (optional)"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-white text-black rounded-lg font-semibold text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingId ? "Update" : "Create"}
                </button>
              </form>
            </div>
          )}

          {loading ? (
            <div className="text-center text-muted mt-12 animate-pulse-slow">Loading...</div>
          ) : questions.length === 0 ? (
            <div className="text-center mt-16">
              <FileText className="w-12 h-12 text-muted mx-auto mb-4" />
              <p className="text-muted">No questions yet. Add your first question!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className="p-5 rounded-xl bg-card border border-border"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{q.question}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${difficultyColor(q.difficulty)}`}>
                          {q.difficulty}
                        </span>
                        {q.category && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-white/5 border border-border text-muted">
                            {q.category}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleEdit(q)}
                        className="p-2 rounded-lg text-muted hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(q.id)}
                        className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/5 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
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
