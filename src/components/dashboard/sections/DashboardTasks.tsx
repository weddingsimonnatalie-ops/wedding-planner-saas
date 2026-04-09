"use client";

import Link from "next/link";
import { CheckSquare, AlertCircle, Check, Mail } from "lucide-react";
import { ArrowRight } from "lucide-react";

interface TaskItem {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  isCompleted: boolean;
  assignedToName: string | null;
  categoryName: string | null;
  categoryColour: string | null;
  supplierId: string | null;
  supplierName: string | null;
}

interface DashboardTasksProps {
  overdue: number;
  dueSoon: number;
  upcoming: TaskItem[];
  onMarkDone: (task: { id: string; title: string }) => void;
  onSendReminder: (taskId: string) => void;
}

export function DashboardTasks({
  overdue,
  dueSoon,
  upcoming,
  onMarkDone,
  onSendReminder,
}: DashboardTasksProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-slate-500" />
          <p className="text-sm font-semibold text-gray-800">Tasks</p>
          {(overdue > 0 || dueSoon > 0) && (
            <span className="text-xs">
              {overdue > 0 && (
                <span className="text-red-600 font-medium">{overdue} overdue</span>
              )}
              {overdue > 0 && dueSoon > 0 && " · "}
              {dueSoon > 0 && <span className="text-gray-400">{dueSoon} due soon</span>}
            </span>
          )}
        </div>
        <Link href="/tasks" className="text-xs text-primary hover:underline flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <CheckSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">All caught up!</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {upcoming.map(t => {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const dueDate = t.dueDate ? new Date(t.dueDate) : null;
            if (dueDate) dueDate.setHours(0, 0, 0, 0);
            const diffDays = dueDate
              ? Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
              : null;
            const isOverdue = diffDays !== null && diffDays < 0;

            let dueLabel: string | null = null;
            let dueCls = "text-gray-500";
            if (diffDays !== null) {
              if (diffDays < 0) {
                const n = Math.abs(diffDays);
                dueLabel = `${n} day${n !== 1 ? "s" : ""} overdue`;
                dueCls = "text-red-600 font-medium";
              } else if (diffDays === 0) {
                dueLabel = "Due today";
                dueCls = "text-amber-600 font-medium";
              } else if (diffDays === 1) {
                dueLabel = "Due tomorrow";
                dueCls = "text-amber-600 font-medium";
              } else {
                dueLabel = "Due " + dueDate!.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              }
            }

            const priorityCls =
              t.priority === "HIGH"   ? { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" } :
              t.priority === "MEDIUM" ? { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-400" } :
                                        { bg: "bg-gray-50", text: "text-gray-500", dot: "bg-gray-400" };

            return (
              <div key={t.id} className={`px-5 py-3 ${isOverdue ? "bg-red-50/30" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center ${priorityCls.bg}`}>
                    {isOverdue ? (
                      <AlertCircle className={`w-4 h-4 text-red-500`} />
                    ) : (
                      <CheckSquare className={`w-4 h-4 ${priorityCls.text}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className={`text-sm font-medium truncate ${isOverdue ? "text-red-700" : "text-gray-900"}`}>
                        {t.title}
                      </p>
                      {t.categoryName && t.categoryColour && (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium border shrink-0"
                          style={{ color: t.categoryColour, borderColor: t.categoryColour, backgroundColor: "transparent" }}
                        >
                          {t.categoryName}
                        </span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium uppercase ${priorityCls.text} ${priorityCls.bg}`}>
                        {t.priority.toLowerCase()}
                      </span>
                    </div>
                    {dueLabel && (
                      <p className={`text-xs ${dueCls}`}>{dueLabel}</p>
                    )}
                    {t.supplierName && t.supplierId && (
                      <p className="text-xs text-gray-400 mt-1">
                        <Link
                          href={`/suppliers/${t.supplierId}`}
                          className="text-primary hover:underline"
                        >
                          {t.supplierName}
                        </Link>
                      </p>
                    )}
                    {t.assignedToName && (
                      <p className="text-xs text-gray-700 font-medium mt-0.5">{t.assignedToName}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2.5 ml-11 justify-end">
                  <button
                    onClick={() => onMarkDone({ id: t.id, title: t.title })}
                    className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Done
                  </button>
                  <button
                    onClick={() => onSendReminder(t.id)}
                    title="Send reminder email"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                  </button>
                  <Link
                    href="/tasks"
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    View
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}