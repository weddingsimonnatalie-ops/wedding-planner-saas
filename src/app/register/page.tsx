import { prisma } from "@/lib/prisma";
import RegisterClient from "./RegisterClient";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  let registrationsEnabled = true;
  try {
    const config = await prisma.appConfig.findUnique({ where: { id: "global" } });
    registrationsEnabled = config?.registrationsEnabled ?? true;
  } catch {
    // Table may not exist yet if migration hasn't run — default to enabled
  }

  return (
    <RegisterClient registrationsEnabled={registrationsEnabled} />
  );
}