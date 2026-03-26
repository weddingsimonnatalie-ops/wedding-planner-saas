export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requireServerContext } from "@/lib/server-context";
import { TwoFactorSettings } from "@/components/settings/TwoFactorSettings";
import { TrustedDevicesList } from "@/components/settings/TrustedDevicesList";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function SecurityPage() {
  await requireServerContext(["ADMIN"]);
  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          Settings
        </Link>
      </div>

      <h1 className="text-2xl font-semibold text-gray-900">Security</h1>

      {/* Two-factor authentication */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-medium text-gray-900 mb-1">
          Two-factor authentication
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          Add an extra layer of security by requiring a code from your authenticator
          app each time you sign in.
        </p>
        <TwoFactorSettings />
      </div>

      {/* Trusted devices */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-medium text-gray-900 mb-1">
          Trusted devices
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Devices you&apos;ve marked as trusted. Trusted devices stay logged in longer.
        </p>
        <TrustedDevicesList />
      </div>
    </div>
  );
}
