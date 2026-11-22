import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/app";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The record you are looking for does not exist or is outside your organization.
      </p>
      <Button asChild><Link href={ROUTES.invoices}>Back to invoices</Link></Button>
    </main>
  );
}
