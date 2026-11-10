import { resolve } from "node:path";
import { Store } from "../backend/store";
const email = process.argv[2]?.toLowerCase();
if (!email || !email.includes("@"))
  throw new Error(
    "Usage: npm run admin -- registered-owner@example.com. Stop the API first.",
  );
const store = await new Store(resolve(process.env.DATA_DIR || ".data")).init();
try {
  await store.transaction((d) => {
    const u = d.users.find((u: any) => u.email === email);
    if (!u) throw new Error("Register the owner account first");
    u.role = "administrator";
    d.activity_logs.push({
      id: crypto.randomUUID(),
      user_id: u.id,
      created_at: new Date().toISOString(),
      action: "admin.provisioned_by_operator",
      resource_id: u.id,
    });
  });
  console.log(
    "Administrator role provisioned. No private keys are exposed by this role.",
  );
} finally {
  await store.close();
}
