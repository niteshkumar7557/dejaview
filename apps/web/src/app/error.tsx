"use client";

import { ButtonLink, Button } from "@/components/ui/Button";
import { PageTitle } from "@/components/ui/PageTitle";

/** Any screen whose data fails to load: the frame and navigation stay, with a sentence and Retry. */
// Production builds hide server error messages, so the sentence covers the usual cause instead of quoting it.
export default function ScreenError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageTitle
      title="This screen couldn't load"
      subline="Its data didn't arrive. If the DejaView API or its database is down, start it and retry; nothing you did caused this."
      actions={
        <>
          <ButtonLink href="/">Overview</ButtonLink>
          <Button variant="primary" onClick={reset}>Retry</Button>
        </>
      }
    />
  );
}
