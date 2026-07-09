import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { roleByKey } from "@/lib/constants";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  const role = roleByKey(session.profile.role_key);
  redirect(`/${role.home}`);
}
