"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import api from "@/lib/api";
import { JobRole } from "@/types";
import { Briefcase, Plus, Pencil, Trash2, X } from "lucide-react";

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      const { data } = await api.get("/admin/roles");
      setRoles(data.roles || []);
    } catch (err) {
      console.error("Failed to fetch roles:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitle("");
    setDescription("");
    setDepartment("");
  };

  const handleEdit = (role: JobRole) => {
    setEditingId(role.id);
    setTitle(role.title);
    setDescription(role.description);
    setDepartment(role.department || "");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingId) {
        await api.put(`/admin/roles/${editingId}`, { title, description, department });
      } else {
        await api.post("/admin/roles", { title, description, department });
      }
      resetForm();
      fetchRoles();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this role?")) return;
    try {
      await api.delete(`/admin/roles/${id}`);
      fetchRoles();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to delete role");
    }
  };

  return (
    <ProtectedRoute requiredRole="admin">
      <Navbar />
      <main className="pt-20 pb-12 px-4 max-w-4xl mx-auto">
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Briefcase className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Job Roles</h1>
            </div>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="px-4 py-2 bg-white text-black rounded-lg font-semibold text-sm hover:bg-gray-200 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Role
            </button>
          </div>

          {showForm && (
            <div className="p-6 rounded-xl bg-card border border-border mb-6 animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">{editingId ? "Edit Role" : "New Role"}</h2>
                <button onClick={resetForm} className="text-muted hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Role title"
                  required
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Role description"
                  rows={3}
                  required
                  className="resize-none"
                />
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Department (optional)"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-white text-black rounded-lg font-semibold text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingId ? "Update Role" : "Create Role"}
                </button>
              </form>
            </div>
          )}

          {loading ? (
            <div className="text-center text-muted mt-12 animate-pulse-slow">Loading...</div>
          ) : roles.length === 0 ? (
            <div className="text-center mt-16">
              <Briefcase className="w-12 h-12 text-muted mx-auto mb-4" />
              <p className="text-muted">No job roles yet. Create your first role!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="p-5 rounded-xl bg-card border border-border flex items-start justify-between"
                >
                  <div>
                    <p className="font-semibold">{role.title}</p>
                    <p className="text-sm text-muted mt-1">{role.description}</p>
                    {role.department && (
                      <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-white/5 text-xs text-muted">
                        {role.department}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleEdit(role)}
                      className="p-2 rounded-lg text-muted hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(role.id)}
                      className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/5 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
