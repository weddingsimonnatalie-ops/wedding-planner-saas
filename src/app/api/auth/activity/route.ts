export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-better";
import { prisma } from "@/lib/prisma";
import { apiJson } from "@/lib/api-response";
import { UAParser } from "ua-parser-js";

import { handleDbError } from "@/lib/db-error";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const attempts = await prisma.loginAttempt.findMany({
        where: { email: session.user.email },
        orderBy: { createdAt: "desc" },
        take: 10,
    });

    const activity = attempts.map((a) => {
        const parser = new UAParser(a.userAgent ?? "");
        const result = parser.getResult();

        const browser = result.browser.name ?? "Unknown";
        const os = result.os.name ?? "Unknown";
        const deviceType = result.device.type;
        let device: string;
        if (deviceType === "mobile") {
          device = "Mobile";
        } else if (deviceType === "tablet") {
          device = "Tablet";
        } else {
          device = "Desktop";
        }

        return {
          id: a.id,
          success: a.success,
          createdAt: a.createdAt,
          ipAddress: a.ipAddress,
          browser,
          os,
          device,
        };
    });

    return apiJson(activity);

  } catch (error) {
    return handleDbError(error);
  }

}
