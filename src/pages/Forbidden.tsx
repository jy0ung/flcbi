import React from "react";
import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";

interface ForbiddenProps {
  title?: string;
  description?: string;
}

export default function Forbidden({
  title = "Access Denied",
  description = "Your account does not have permission to open this page.",
}: ForbiddenProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={title} description={description} />
      <div className="glass-panel p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/10">
          <ShieldAlert className="h-7 w-7 text-warning" />
        </div>
        <p className="text-sm text-muted-foreground">
          If you think this is unexpected, ask an administrator to review your role and branch access.
        </p>
        <div className="mt-5">
          <Button asChild variant="outline">
            <Link to="/">Return to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
