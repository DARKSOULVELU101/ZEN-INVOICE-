import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText aria-hidden="true" />
          </div>
          <CardTitle className="text-xl">Authentication is not configured</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            This deployment does not have an identity provider connected. The invoice module ships with a
            deterministic demo session for local development.
          </p>
          <p>
            Copy <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.example</code> to{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code>, keep{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">AUTH_MODE=demo</code>, run the database
            migration and seed, then reload.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
