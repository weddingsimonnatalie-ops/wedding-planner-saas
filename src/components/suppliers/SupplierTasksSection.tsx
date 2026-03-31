"use client";

import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { fetchApi } from "@/lib/fetch";
import { usePermissions } from "@/hooks/usePermissions";
import { TaskModal, TaskData, TaskPriority } from "@/components/tasks/TaskModal";
import { ConfirmModal } from "@/components/ConfirmModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function priorityDot(priority: TaskPriority) {
  const colour =
    priority === "HIGH"   ? "bg-red-500" :
    priority === "MEDIUM" ? "bg-amber-400" :
    "bg-gray-400";
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${colour}`} />;
}

function dueDateLabel(dueDate: string | null, isCompleted: boolean): string | null {
  if (!dueDate || isCompleted) return null;
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return `${n} day${n !== 1 ? "s" : ""} overdue`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return "Due " + new Date(dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function dueDateClass(dueDate: string | null, isCompleted: boolean): string {
  if (!dueDate || isCompleted) return "text-gray-400";
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "text-red-600 font-medium";
  if (diffDays <= 1) return "text-amber-600 font-medium";
  return "text-gray-500";
}

const INTERVAL_LABEL: Record<string, string> = {
  DAILY: "daily", WEEKLY: "weekly", FORTNIGHTLY: "fortnightly", MONTHLY: "monthly",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SupplierTasksSection({
  supplierId,
  supplierName,
  isCollapsed,
  onToggleCollapse,
}: {
  supplierId: string;
  supplierName: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { can: perms, isViewer } = usePermissions();
  const canComplete = !isViewer;
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskData | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    fetchApi(`/api/tasks?supplierId=${supplierId}`)
      .then(r => r.json())
      .then((data: TaskData[]) => {
        // Sort: incomplete first (by dueDate asc, nulls last), completed at bottom
        data.sort((a, b) => {
          if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
        setTasks(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [supplierId]);

  // ── Toggle complete ─────────────────────────────────────────────────────────

  async function handleToggleComplete(task: TaskData) {
    const completing = !task.isCompleted;
    const now = new Date().toISOString();

    // Optimistic
    setTasks(prev => prev.map(t =>
      t.id === task.id
        ? { ...t, isCompleted: completing, completedAt: completing ? now : null }
        : t
    ));

    const res = await fetch(`/api/tasks/${task.id}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: completing }),
    });

    if (!res.ok) {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      showToast("Failed to update task", false);
      return;
    }

    const { task: updated, nextTask } = await res.json();
    setTasks(prev => {
      const next = prev.map(t => t.id === task.id ? updated : t);
      // Re-sort after state change
      const withNew = nextTask ? [...next, nextTask] : next;
      withNew.sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
      return withNew;
    });

    showToast(completing ? "Task completed ✓" : "Task marked incomplete");
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  function handleSave(task: TaskData) {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === task.id);
      const next = idx >= 0
        ? prev.map(t => t.id === task.id ? task : t)
        : [...prev, task];
      next.sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
      return next;
    });
    setModalOpen(false);
    setEditing(null);
    showToast(editing ? "Task updated" : "Task added");
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/tasks/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setTasks(prev => prev.filter(t => t.id !== deleteTarget.id));
      showToast("Task deleted");
    } else {
      showToast("Failed to delete", false);
    }
    setDeleteTarget(null);
  }

  const incompleteCount = tasks.filter(t => !t.isCompleted).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div
        className={`px-4 py-3 border-b border-gray-100 flex items-center justify-between min-h-[44px] ${onToggleCollapse ? "cursor-pointer" : ""}`}
        onClick={() => onToggleCollapse?.()}
      >
        <p className="text-sm font-medium text-gray-700">
          Tasks {tasks.length > 0 && <span className="text-gray-400 font-normal">({incompleteCount} open)</span>}
        </p>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {perms.editTasks && (
            <button
              type="button"
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
            >
              <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Add</span>
            </button>
          )}
          {onToggleCollapse && (
            <button type="button" className="p-1 text-gray-400">
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {(!onToggleCollapse || !isCollapsed) && (loading ? (
        <div className="px-4 py-6 animate-pulse space-y-2">
          {[1, 2].map(i => <div key={i} className="h-8 bg-gray-100 rounded" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-gray-400">No tasks for this supplier</p>
          {perms.editTasks && (
            <button
              type="button"
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="mt-2 text-xs text-primary hover:underline"
            >
              + Add task
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {tasks.map(task => {
            const metaParts: string[] = [];
            if (task.category) metaParts.push(task.category.name);
            if (task.assignedTo) metaParts.push(task.assignedTo.name ?? task.assignedTo.email);

            return (
              <div
                key={task.id}
                className={`px-4 py-3 flex items-start gap-2 ${task.isCompleted ? "opacity-60" : ""}`}
              >
                {/* Complete checkbox */}
                <button
                  type="button"
                  onClick={() => canComplete && handleToggleComplete(task)}
                  disabled={!canComplete}
                  className={`mt-0.5 shrink-0 group ${canComplete ? "" : "cursor-not-allowed opacity-40"}`}
                  title={
                    !canComplete
                      ? "You don't have permission to complete tasks"
                      : task.isCompleted ? "Mark incomplete" : "Mark complete"
                  }
                >
                  {task.isCompleted ? (
                    <div className="w-4 h-4 rounded border-2 border-primary bg-primary flex items-center justify-center transition-colors duration-200">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                        <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  ) : (
                    <div className={`w-4 h-4 rounded border-2 border-gray-300 transition-colors duration-200 ${canComplete ? "group-hover:border-primary" : ""}`} />
                  )}
                </button>

                {/* Priority dot */}
                <div className="mt-1 shrink-0">{priorityDot(task.priority)}</div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1 min-w-0">
                      <p className={`text-sm font-medium leading-tight ${task.isCompleted ? "line-through text-gray-400" : "text-gray-800"}`}>
                        {task.title}
                      </p>
                      {task.isRecurring && task.recurringInterval && (
                        <span title={`Recurring ${INTERVAL_LABEL[task.recurringInterval] ?? task.recurringInterval}`}>
                          <RefreshCw className="w-3 h-3 text-gray-400 shrink-0" />
                        </span>
                      )}
                    </div>
                    {(() => {
                      const lbl = dueDateLabel(task.dueDate ?? null, task.isCompleted);
                      return lbl ? (
                        <span className={`text-xs shrink-0 ${dueDateClass(task.dueDate ?? null, task.isCompleted)}`}>
                          {lbl}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {metaParts.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">{metaParts.join(" · ")}</p>
                  )}
                </div>

                {/* Actions */}
                {perms.editTasks && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setEditing(task); setModalOpen(true); }}
                      className="p-1 rounded text-gray-400 hover:text-primary hover:bg-primary/5 transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(task)}
                      className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )
      )}

      {/* Modals */}
      {modalOpen && perms.editTasks && (
        <TaskModal
          initial={editing}
          prefillSupplierId={supplierId}
          prefillSupplierName={supplierName}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditing(null); }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          message={
            <span>
              Delete task <strong>{deleteTarget.title}</strong>? This cannot be undone.
            </span>
          }
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {toast && (
        <div className={`fixed right-4 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 ${toast.ok ? "bg-green-600" : "bg-red-600"}`} style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
