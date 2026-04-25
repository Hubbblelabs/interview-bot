"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Send,
  Download,
  FileSpreadsheet,
  FileText,
  Save,
  Loader2,
  Sparkles,
  ChevronDown,
  Edit3,
  Check,
  X,
  BarChart2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import ProtectedRoute from "@/components/ProtectedRoute";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TopicScore {
  topic_name: string;
  score: number | null;
  status: string;
}

interface ChatbotRow {
  user_id: string;
  reg_no: string;
  name: string;
  email: string;
  group_test_id: string;
  group_test_name: string;
  overall_score: number;
  total_attempts: number;
  status: string;
  topic_scores: Record<string, TopicScore>;
  skill_match: number | null;
  rank: number;
}

interface TopicColumn {
  id: string;
  name: string;
}

interface ChatbotResult {
  message: string;
  group_test_name: string;
  group_test_id: string | null;
  topic_columns: TopicColumn[];
  rows: ChatbotRow[];
  total: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  loading?: boolean;
}

interface JD {
  id: string;
  title: string;
  company?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtScore(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function statusBadge(status: string) {
  const s = (status || "").replace("_", " ").toLowerCase();
  const colors: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700",
    "in progress": "bg-amber-100 text-amber-700",
    pending: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
        colors[s] || "bg-slate-100 text-slate-600"
      }`}
    >
      {s}
    </span>
  );
}

// ── CSV download (client-side) ─────────────────────────────────────────────

function downloadCSV(
  rows: ChatbotRow[],
  topicColumns: TopicColumn[],
  groupTestName: string
) {
  const headers = [
    "Rank",
    "Reg No",
    "Name",
    "Email",
    ...topicColumns.map((tc) => `${tc.name} Score`),
    "Overall Score",
    "Attempts",
    "Status",
  ];
  if (rows.some((r) => r.skill_match != null)) headers.push("JD Match (%)");

  const esc = (v: string | number) =>
    `"${String(v).replace(/"/g, '""')}"`;

  const dataRows = rows.map((r) => [
    r.rank,
    r.reg_no,
    r.name,
    r.email,
    ...topicColumns.map((tc) => {
      const ts = r.topic_scores?.[tc.id];
      return ts?.score != null ? `${ts.score.toFixed(1)}%` : "N/A";
    }),
    fmtScore(r.overall_score),
    r.total_attempts,
    r.status,
    ...(rows.some((x) => x.skill_match != null)
      ? [r.skill_match != null ? `${r.skill_match.toFixed(1)}%` : "N/A"]
      : []),
  ]);

  const csv = [headers, ...dataRows]
    .map((row) => row.map(esc).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv, ""], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${groupTestName.replace(/\s+/g, "_")}_students.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AdminChatbot() {
  return (
    <ProtectedRoute requiredRole="admin">
      <ChatbotContent />
    </ProtectedRoute>
  );
}

function ChatbotContent() {
  // ─ Chat state ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I can filter students from your group tests. Try asking:\n• \"Show top 5 students in SWE group\"\n• \"Students in DBMS test with score above 70\"\n• \"All students in Operating Systems group\"",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedJdId, setSelectedJdId] = useState<string>("");
  const [jdList, setJdList] = useState<JD[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ─ Results state ───────────────────────────────────────────────────────────
  const [result, setResult] = useState<ChatbotResult | null>(null);
  const [tableRows, setTableRows] = useState<ChatbotRow[]>([]);

  // ─ Inline edit state ───────────────────────────────────────────────────────
  type EditField = "reg_no" | "name";
  const [editCell, setEditCell] = useState<{
    userId: string;
    field: EditField;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dirtyRows, setDirtyRows] = useState<
    Record<string, { reg_no?: string; name?: string }>
  >({});
  const [saving, setSaving] = useState(false);

  // ─ Excel download state ────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  // ─ Load JDs ────────────────────────────────────────────────────────────────
  useEffect(() => {
    api
      .get("/admin/job-descriptions")
      .then((r) => setJdList(r.data.items || []))
      .catch(() => {});
  }, []);

  // ─ Auto-scroll chat ────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─ Send chat ───────────────────────────────────────────────────────────────
  async function sendQuery() {
    const query = input.trim();
    if (!query || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", loading: true },
    ]);

    try {
      const res = await api.post("/admin/chatbot/query", {
        query,
        jd_id: selectedJdId || null,
      });
      const data: ChatbotResult = res.data;

      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        updated[lastIdx] = {
          role: "assistant",
          content: `${data.message}\n\n**Found ${data.total} student${data.total !== 1 ? "s" : ""}** in **${data.group_test_name}**`,
          loading: false,
        };
        return updated;
      });

      setResult(data);
      setTableRows(data.rows);
      setDirtyRows({});
      setEditCell(null);
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content:
            err.response?.data?.detail ||
            "Something went wrong. Please try again.",
          loading: false,
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery();
    }
  }

  // ─ Inline editing ──────────────────────────────────────────────────────────
  function startEdit(userId: string, field: EditField, current: string) {
    setEditCell({ userId, field });
    setEditValue(current);
  }

  function commitEdit() {
    if (!editCell) return;
    const { userId, field } = editCell;
    const prev = dirtyRows[userId] || {};
    const original = tableRows.find((r) => r.user_id === userId)?.[field] ?? "";
    if (editValue.trim() !== original) {
      setDirtyRows({
        ...dirtyRows,
        [userId]: { ...prev, [field]: editValue.trim() },
      });
    }
    // Update display
    setTableRows((rows) =>
      rows.map((r) =>
        r.user_id === userId ? { ...r, [field]: editValue.trim() || r[field] } : r
      )
    );
    setEditCell(null);
  }

  function cancelEdit() {
    setEditCell(null);
  }

  // ─ Save changes ────────────────────────────────────────────────────────────
  async function saveChanges() {
    const entries = Object.entries(dirtyRows);
    if (!entries.length) {
      toast.info("No changes to save.");
      return;
    }
    setSaving(true);
    let saved = 0;
    let failed = 0;
    for (const [userId, fields] of entries) {
      try {
        await api.patch("/admin/chatbot/students", {
          user_id: userId,
          ...fields,
        });
        saved++;
      } catch {
        failed++;
      }
    }
    setSaving(false);
    setDirtyRows({});
    if (saved) toast.success(`Saved ${saved} student update${saved > 1 ? "s" : ""}.`);
    if (failed) toast.error(`Failed to save ${failed} update${failed > 1 ? "s" : ""}.`);
  }

  // ─ Excel export ────────────────────────────────────────────────────────────
  async function downloadExcel() {
    if (!result || !tableRows.length) return;
    setExporting(true);
    try {
      const res = await api.post(
        "/admin/chatbot/export-excel",
        {
          rows: tableRows,
          topic_columns: result.topic_columns,
          group_test_name: result.group_test_name,
        },
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.group_test_name.replace(/\s+/g, "_")}_students.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Excel file downloaded.");
    } catch {
      toast.error("Failed to export Excel.");
    } finally {
      setExporting(false);
    }
  }

  const hasDirty = Object.keys(dirtyRows).length > 0;
  const topicCols = result?.topic_columns || [];
  const hasJdMatch = tableRows.some((r) => r.skill_match != null);

  // ─ Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#f4f6fb]" style={{ paddingLeft: "var(--admin-sidebar-width, 250px)" }}>
      {/* ── Left: Chat Panel ─────────────────────────────────────────────── */}
      <div className="w-[340px] min-w-[280px] flex flex-col border-r border-border bg-white shadow-sm">
        {/* Chat header */}
        <div className="px-4 py-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">AI Student Filter</p>
              <p className="text-xs text-muted">Ask in natural language</p>
            </div>
          </div>
        </div>

        {/* JD selector */}
        <div className="px-3 pt-3 pb-2">
          <label className="text-xs font-medium text-muted mb-1 block">
            Job Description (optional)
          </label>
          <div className="relative">
            <select
              value={selectedJdId}
              onChange={(e) => setSelectedJdId(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 pr-8 bg-white text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— None —</option>
              {jdList.map((jd) => (
                <option key={jd.id} value={jd.id}>
                  {jd.title}{jd.company ? ` (${jd.company})` : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="mx-3 border-t border-border/50" />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.map((msg, idx) => (
            <MessageBubble key={idx} msg={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border bg-white">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. top 5 students in SWE group"
              rows={2}
              disabled={loading}
              className="flex-1 resize-none text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 text-foreground bg-white placeholder:text-muted/60 disabled:opacity-50"
            />
            <button
              onClick={sendQuery}
              disabled={loading || !input.trim()}
              className="p-2.5 rounded-xl bg-primary hover:bg-secondary text-white disabled:opacity-40 transition-colors shadow"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted/60 mt-1 pl-1">Enter to send · Shift+Enter for newline</p>
        </div>
      </div>

      {/* ── Right: Results Panel ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Results header */}
        <div className="px-6 py-4 border-b border-border bg-white shadow-sm flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <BarChart2 className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base font-bold text-foreground truncate">
                {result ? result.group_test_name : "Student Results"}
              </h1>
              <p className="text-xs text-muted">
                {result
                  ? `${result.total} student${result.total !== 1 ? "s" : ""} found`
                  : "Ask the chatbot to filter students"}
              </p>
            </div>
          </div>

          {result && tableRows.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {hasDirty && (
                <button
                  onClick={saveChanges}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors shadow disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save Changes
                </button>
              )}
              <button
                onClick={() =>
                  downloadCSV(tableRows, topicCols, result.group_test_name)
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-slate-50 text-foreground text-sm font-medium transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                CSV
              </button>
              <button
                onClick={downloadExcel}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium transition-colors shadow disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                Excel
              </button>
            </div>
          )}
        </div>

        {/* Table area */}
        <div className="flex-1 overflow-auto p-4">
          {!result ? (
            <EmptyState />
          ) : tableRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted">
              <Users className="w-12 h-12 opacity-30" />
              <p className="text-sm">No students matched your query.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
              {/* Edit hint */}
              <div className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                <Edit3 className="w-3 h-3" />
                Click on a <strong>Reg No</strong> or <strong>Name</strong> cell to edit. Save before downloading.
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700 text-white">
                      <Th>Rank</Th>
                      <Th>Reg No</Th>
                      <Th>Name</Th>
                      <Th>Email</Th>
                      {topicCols.map((tc) => (
                        <Th key={tc.id}>{tc.name}</Th>
                      ))}
                      <Th>Overall</Th>
                      <Th>Attempts</Th>
                      <Th>Status</Th>
                      {hasJdMatch && <Th>JD Match</Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, idx) => {
                      const isDirty = !!dirtyRows[row.user_id];
                      return (
                        <tr
                          key={row.user_id + idx}
                          className={`border-t border-border/50 transition-colors ${
                            isDirty
                              ? "bg-amber-50"
                              : idx % 2 === 0
                              ? "bg-white"
                              : "bg-slate-50/60"
                          } hover:bg-primary/5`}
                        >
                          {/* Rank */}
                          <td className="px-3 py-2.5 text-center font-bold text-primary">
                            {row.rank}
                          </td>

                          {/* Reg No — editable */}
                          <EditableCell
                            value={row.reg_no}
                            isEditing={
                              editCell?.userId === row.user_id &&
                              editCell?.field === "reg_no"
                            }
                            editValue={editValue}
                            onEditValueChange={setEditValue}
                            onStartEdit={() =>
                              startEdit(row.user_id, "reg_no", row.reg_no)
                            }
                            onCommit={commitEdit}
                            onCancel={cancelEdit}
                            modified={!!dirtyRows[row.user_id]?.reg_no}
                          />

                          {/* Name — editable */}
                          <EditableCell
                            value={row.name}
                            isEditing={
                              editCell?.userId === row.user_id &&
                              editCell?.field === "name"
                            }
                            editValue={editValue}
                            onEditValueChange={setEditValue}
                            onStartEdit={() =>
                              startEdit(row.user_id, "name", row.name)
                            }
                            onCommit={commitEdit}
                            onCancel={cancelEdit}
                            modified={!!dirtyRows[row.user_id]?.name}
                          />

                          {/* Email */}
                          <td className="px-3 py-2.5 text-muted text-xs max-w-[180px] truncate">
                            {row.email}
                          </td>

                          {/* Per-topic scores */}
                          {topicCols.map((tc) => {
                            const ts = row.topic_scores?.[tc.id];
                            return (
                              <td
                                key={tc.id}
                                className="px-3 py-2.5 text-center"
                              >
                                {ts?.score != null ? (
                                  <ScorePill score={ts.score} />
                                ) : (
                                  <span className="text-muted/50 text-xs">—</span>
                                )}
                              </td>
                            );
                          })}

                          {/* Overall */}
                          <td className="px-3 py-2.5 text-center font-semibold">
                            {row.overall_score != null ? (
                              <ScorePill score={row.overall_score} size="lg" />
                            ) : (
                              <span className="text-muted/50">—</span>
                            )}
                          </td>

                          {/* Attempts */}
                          <td className="px-3 py-2.5 text-center text-muted">
                            {row.total_attempts}
                          </td>

                          {/* Status */}
                          <td className="px-3 py-2.5 text-center">
                            {statusBadge(row.status)}
                          </td>

                          {/* JD Match */}
                          {hasJdMatch && (
                            <td className="px-3 py-2.5 text-center">
                              {row.skill_match != null ? (
                                <ScorePill score={row.skill_match} />
                              ) : (
                                <span className="text-muted/50 text-xs">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-border/50 bg-slate-50 flex items-center justify-between text-xs text-muted">
                <span>{tableRows.length} student{tableRows.length !== 1 ? "s" : ""} shown</span>
                {hasDirty && (
                  <span className="text-amber-600 font-medium">
                    {Object.keys(dirtyRows).length} unsaved change{Object.keys(dirtyRows).length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-3 text-left font-semibold text-white text-xs whitespace-nowrap">
      {children}
    </th>
  );
}

interface EditableCellProps {
  value: string;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onStartEdit: () => void;
  onCommit: () => void;
  onCancel: () => void;
  modified?: boolean;
}

function EditableCell({
  value,
  isEditing,
  editValue,
  onEditValueChange,
  onStartEdit,
  onCommit,
  onCancel,
  modified,
}: EditableCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommit();
              if (e.key === "Escape") onCancel();
            }}
            onBlur={onCommit}
            className="flex-1 min-w-0 text-sm border border-primary/50 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); onCommit(); }}
            className="p-0.5 text-emerald-600 hover:text-emerald-700"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); onCancel(); }}
            className="p-0.5 text-red-500 hover:text-red-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    );
  }

  return (
    <td
      className={`px-3 py-2.5 cursor-pointer group ${modified ? "font-semibold text-amber-700" : ""}`}
      onClick={onStartEdit}
      title="Click to edit"
    >
      <span className="flex items-center gap-1">
        {value || <span className="text-muted/50 italic text-xs">N/A</span>}
        <Edit3 className="w-3 h-3 text-muted/30 group-hover:text-primary/60 transition-colors shrink-0" />
      </span>
    </td>
  );
}

function ScorePill({ score, size = "sm" }: { score: number; size?: "sm" | "lg" }) {
  const color =
    score >= 80
      ? "bg-emerald-100 text-emerald-700"
      : score >= 60
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-600";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full font-medium ${color} ${
        size === "lg" ? "text-sm" : "text-xs"
      }`}
    >
      {score.toFixed(1)}%
    </span>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-0.5 shrink-0">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div
        className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-white rounded-tr-sm"
            : "bg-slate-100 text-foreground rounded-tl-sm"
        }`}
      >
        {msg.loading ? (
          <div className="flex items-center gap-1.5 text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Filtering students…</span>
          </div>
        ) : (
          <FormattedMessage text={msg.content} />
        )}
      </div>
    </div>
  );
}

function FormattedMessage({ text }: { text: string }) {
  // Simple markdown: **bold** and bullet lines
  const lines = text.split("\n");
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith("**") ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : (
            part
          )
        );
        const isBullet = line.trim().startsWith("•");
        return (
          <p key={i} className={isBullet ? "pl-1" : ""}>
            {parts}
          </p>
        );
      })}
    </div>
  );
}

function EmptyState() {
  const suggestions = [
    "Show top 10 students in SWE group",
    "Students in OS test with score above 75",
    "All students in DBMS group test",
    "Top 5 from any group test",
  ];
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 py-16">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Sparkles className="w-10 h-10 text-primary/60" />
      </div>
      <div className="text-center max-w-md">
        <h2 className="text-lg font-bold text-foreground mb-2">
          Ask the AI to filter students
        </h2>
        <p className="text-muted text-sm">
          The chatbot will understand your natural language query, match it to a
          group test, and display a ranked, editable table of students.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
        {suggestions.map((s) => (
          <div
            key={s}
            className="px-3 py-2 rounded-xl border border-dashed border-border bg-white text-xs text-muted hover:border-primary/40 hover:text-primary/80 cursor-default transition-colors text-center"
          >
            "{s}"
          </div>
        ))}
      </div>
    </div>
  );
}
