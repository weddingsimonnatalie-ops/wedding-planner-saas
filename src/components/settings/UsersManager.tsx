"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ShieldCheck, LockOpen, Mail, CheckCircle, KeyRound, Pencil, Plus, Clock, X } from "lucide-react";
import { UserRole } from "@prisma/client";
import { PasswordResetModal } from "./PasswordResetModal";
import { EditUserModal } from "./EditUserModal";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  lockedUntil: Date | string | null;
  emailVerified: Date | string | null;
  createdAt: Date | string;
}

interface Invite {
  id: string;
  email: string | null;
  role: UserRole;
  expiresAt: Date | string;
  createdAt: Date | string;
}

interface Props {
  initialUsers: User[];
  initialInvites: Invite[];
  ownerUserId: string | null;
  currentUserEmail: string;
  emailVerificationRequired: boolean;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "VIEWER", label: "Viewer" },
  { value: "RSVP_MANAGER", label: "RSVP Manager" },
];

export function UsersManager({ initialUsers, initialInvites, ownerUserId, currentUserEmail, emailVerificationRequired }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [users, setUsers] = useState(initialUsers);
  const [invites, setInvites] = useState(initialInvites);
  const [roleLoading, setRoleLoading] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("ADMIN");
  const [inviteError, setInviteError] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Password reset modal state
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);

  // Edit user modal state
  const [editUser, setEditUser] = useState<User | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleRoleChange(id: string, name: string | null, role: UserRole) {
    setRoleLoading(id);
    const res = await fetch(`/api/users/${id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    setRoleLoading(null);
    if (res.ok) {
      setUsers(users.map((u) => (u.id === id ? { ...u, role: data.role } : u)));
      showToast(`Role updated for ${name ?? data.email}. Changes take effect on their next login.`);
      startTransition(() => router.refresh());
    } else {
      showToast(data.error ?? "Failed to update role", false);
    }
  }

  async function handleSendInvite() {
    setInviteError("");
    setInviteLoading(true);
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const data = await res.json();
    setInviteLoading(false);
    if (res.ok) {
      setInvites([data, ...invites]);
      setShowInviteForm(false);
      setInviteEmail("");
      setInviteRole("ADMIN");
      showToast(`Invite sent to ${data.email}`);
      startTransition(() => router.refresh());
    } else {
      setInviteError(data.error ?? "Failed to send invite");
    }
  }

  async function handleRevokeInvite(id: string, email: string | null) {
    if (!confirm(`Revoke invite${email ? ` for ${email}` : ""}?`)) return;
    const res = await fetch(`/api/invites/${id}`, { method: "DELETE" });
    if (res.ok) {
      setInvites(invites.filter((inv) => inv.id !== id));
      showToast("Invite revoked");
      startTransition(() => router.refresh());
    } else {
      showToast("Failed to revoke invite", false);
    }
  }

  async function handleDelete(id: string, name: string | null, email: string) {
    if (!confirm(`Remove ${name ?? email} from this wedding?`)) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) {
      setUsers(users.filter((u) => u.id !== id));
      showToast("User removed");
      startTransition(() => router.refresh());
    } else {
      showToast(data.error ?? "Failed to remove user", false);
    }
  }

  async function handleUnlock(id: string) {
    const res = await fetch(`/api/users/${id}/unlock`, { method: "POST" });
    if (res.ok) {
      setUsers(users.map((u) => (u.id === id ? { ...u, lockedUntil: null } : u)));
      showToast("Account unlocked");
      startTransition(() => router.refresh());
    } else {
      showToast("Failed to unlock account", false);
    }
  }

  async function handleVerify(id: string) {
    const res = await fetch(`/api/users/${id}/verify`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setUsers(users.map((u) => (u.id === id ? { ...u, emailVerified: data.emailVerified } : u)));
      showToast("User verified");
      startTransition(() => router.refresh());
    } else {
      showToast("Failed to verify user", false);
    }
  }

  async function handleResendVerification(id: string) {
    const res = await fetch(`/api/users/${id}/resend-verification`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      showToast("Verification email sent");
    } else {
      showToast(data.error ?? "Failed to send verification email", false);
    }
  }

  async function handleResetPassword(id: string, newPassword: string) {
    const res = await fetch(`/api/users/${id}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    const data = await res.json();
    if (res.ok) {
      setResetPasswordUser(null);
      showToast("Password reset. User will need to log in again.");
      startTransition(() => router.refresh());
    } else {
      throw new Error(data.error ?? "Failed to reset password");
    }
  }

  async function handleEditUser(id: string, name: string, email: string) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const data = await res.json();
    if (res.ok) {
      setUsers(users.map((u) => (u.id === id ? { ...u, name: data.name, email: data.email, emailVerified: data.emailVerified } : u)));
      setEditUser(null);
      const emailChanged = email !== editUser?.email;
      showToast(emailChanged ? "User updated. They will need to log in again." : "User updated.");
      startTransition(() => router.refresh());
    } else {
      throw new Error(data.error ?? "Failed to update user");
    }
  }

  const roleBadgeClass: Record<UserRole, string> = {
    ADMIN: "text-purple-700 bg-purple-50 border-purple-200",
    VIEWER: "text-blue-700 bg-blue-50 border-blue-200",
    RSVP_MANAGER: "text-green-700 bg-green-50 border-green-200",
  };

  const roleLabel: Record<UserRole, string> = {
    ADMIN: "Admin",
    VIEWER: "Viewer",
    RSVP_MANAGER: "RSVP Manager",
  };

  const pendingInvites = invites.filter((inv) => !inv.email || new Date(inv.expiresAt) > new Date());

  return (
    <div className="space-y-6">
      {/* Team members list */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Team members</h3>
        <div className="bg-white rounded-xl border border-gray-200">
          {users.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No members</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {users.map((user) => {
                const isOwn = user.email === currentUserEmail;
                const isChangingRole = roleLoading === user.id;
                const isVerified = !!user.emailVerified;
                return (
                  <li key={user.id}>
                    <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {user.name ?? "—"}
                          {isOwn && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                        </p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>

                      {/* Role dropdown */}
                      <div
                        className="relative shrink-0"
                        title={isOwn ? "You cannot change your own role" : undefined}
                      >
                        <select
                          value={user.role}
                          disabled={isOwn || isChangingRole}
                          onChange={(e) => handleRoleChange(user.id, user.name, e.target.value as UserRole)}
                          className={`text-xs border rounded-lg pl-2 pr-6 py-1 appearance-none focus:outline-none focus:ring-2 focus:ring-primary transition-colors font-medium ${
                            roleBadgeClass[user.role]
                          } ${
                            isOwn || isChangingRole
                              ? "cursor-not-allowed opacity-70"
                              : "cursor-pointer hover:opacity-80"
                          }`}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center">
                          <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        {isChangingRole && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
                        )}
                      </div>

                      {/* Verification status */}
                      {emailVerificationRequired && (
                        isVerified ? (
                          <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 shrink-0">
                            <CheckCircle className="w-3 h-3" />
                            Verified
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                              <Mail className="w-3 h-3" />
                              Unverified
                            </span>
                            <button
                              type="button"
                              onClick={() => handleResendVerification(user.id)}
                              title="Resend verification email"
                              className="text-xs text-primary hover:text-primary/80 transition-colors"
                            >
                              Resend
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVerify(user.id)}
                              title="Manually verify user"
                              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              Verify
                            </button>
                          </div>
                        )
                      )}

                      {/* Lock badge + unlock button */}
                      {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
                        <>
                          <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 shrink-0">
                            &#128274; Locked until{" "}
                            {new Date(user.lockedUntil).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUnlock(user.id)}
                            title="Unlock account"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 transition-colors shrink-0"
                          >
                            <LockOpen className="w-3 h-3" />
                            Unlock
                          </button>
                        </>
                      )}

                      {/* 2FA badge */}
                      {user.twoFactorEnabled ? (
                        <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 shrink-0">
                          <ShieldCheck className="w-3 h-3" />
                          2FA on
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 shrink-0">No 2FA</span>
                      )}

                      <p className="text-xs text-gray-400 shrink-0">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </p>

                      {!isOwn ? (
                        user.id === ownerUserId ? (
                          // Owner: no actions available to other admins
                          <div className="w-20" />
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditUser(user)}
                              title="Edit user"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setResetPasswordUser(user)}
                              title="Reset password"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(user.id, user.name, user.email)}
                              title="Remove from wedding"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )
                      ) : (
                        <div className="w-20" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Pending invites</h3>
          <div className="bg-white rounded-xl border border-gray-200">
            <ul className="divide-y divide-gray-100">
              {pendingInvites.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{inv.email ?? "No email specified"}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs border rounded-full px-2 py-0.5 font-medium shrink-0 ${
                    inv.role === "ADMIN" ? "text-purple-700 bg-purple-50 border-purple-200" :
                    inv.role === "VIEWER" ? "text-blue-700 bg-blue-50 border-blue-200" :
                    "text-green-700 bg-green-50 border-green-200"
                  }`}>
                    {roleLabel[inv.role]}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRevokeInvite(inv.id, inv.email)}
                    title="Revoke invite"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Invite member form */}
      {showInviteForm ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <p className="text-sm font-medium text-gray-700">Invite a team member</p>
          <input
            type="email"
            placeholder="Email address *"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500">
            An invite link will be emailed to them. It expires in 7 days.
          </p>
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSendInvite}
              disabled={inviteLoading}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {inviteLoading ? "Sending…" : "Send invite"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowInviteForm(false);
                setInviteError("");
                setInviteEmail("");
                setInviteRole("ADMIN");
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowInviteForm(true)}
          className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-4 h-4" /> Invite member
        </button>
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Password reset modal */}
      {resetPasswordUser && (
        <PasswordResetModal
          userName={resetPasswordUser.name}
          userEmail={resetPasswordUser.email}
          onConfirm={async (newPassword) => {
            await handleResetPassword(resetPasswordUser.id, newPassword);
          }}
          onCancel={() => setResetPasswordUser(null)}
        />
      )}

      {/* Edit user modal */}
      {editUser && (
        <EditUserModal
          user={editUser}
          onConfirm={async (name, email) => {
            await handleEditUser(editUser.id, name, email);
          }}
          onCancel={() => setEditUser(null)}
        />
      )}
    </div>
  );
}
