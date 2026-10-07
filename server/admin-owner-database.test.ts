import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { users } from "../drizzle/schema";

describe("Agronex production owner record", () => {
  it("matches the configured owner ID to Barack's existing admin record", async () => {
    expect(ENV.ownerOpenId).toBeTruthy();
    const db = await getDb();
    expect(db, "The application database must be available").toBeTruthy();
    const [owner] = await db!.select({ email: users.email, name: users.name, role: users.role, openId: users.openId })
      .from(users).where(eq(users.email, "ndengabarack@gmail.com")).limit(1);
    const comparison = {
      ownerRecordFound: Boolean(owner),
      ownerHasAdminRole: owner?.role === "admin",
      configuredIdMatchesRecord: Boolean(owner && owner.openId === ENV.ownerOpenId),
    };
    console.info("Owner ID diagnostic (values withheld):", comparison);
    expect(comparison).toEqual({ ownerRecordFound: true, ownerHasAdminRole: true, configuredIdMatchesRecord: true });
  });
});
