import { prisma } from "@/lib/prisma";
import RegisterClient from "./RegisterClient";

// Server component - checks PayPal config and registration status
export default async function RegisterPage() {
  const paypalConfigured = !!(
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET
  );

  let registrationsEnabled = true;
  try {
    const config = await prisma.appConfig.findUnique({ where: { id: "global" } });
    registrationsEnabled = config?.registrationsEnabled ?? true;
  } catch {
    // Table may not exist yet if migration hasn't run — default to enabled
  }

  return (
    <RegisterClient
      paypalConfigured={paypalConfigured}
      registrationsEnabled={registrationsEnabled}
    />
  );
}