import { prisma } from "@/lib/prisma";
import RegisterClient from "./RegisterClient";

// Server component - checks PayPal config and registration status
export default async function RegisterPage() {
  const paypalConfigured = !!(
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET
  );

  const config = await prisma.appConfig.findUnique({ where: { id: "global" } });
  const registrationsEnabled = config?.registrationsEnabled ?? true;

  return (
    <RegisterClient
      paypalConfigured={paypalConfigured}
      registrationsEnabled={registrationsEnabled}
    />
  );
}