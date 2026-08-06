"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui";

function Inner({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      title="Rebuild all packs with the latest AI prompt — live progress on the next screen"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
          Starting…
        </>
      ) : (
        label
      )}
    </Button>
  );
}

/** Submit button that shows immediate “Starting…” while server flips to GENERATING. */
export function RegeneratePacksButton({
  label = "Regenerate packs",
}: {
  label?: string;
}) {
  return <Inner label={label} />;
}
