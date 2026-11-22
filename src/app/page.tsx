import { redirect } from "next/navigation";
import { ROUTES } from "@/config/app";

export const dynamic = "force-dynamic";

export default function Home() {
  redirect(ROUTES.invoices);
}
