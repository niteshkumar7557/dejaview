import { ButtonLink } from "@/components/ui/Button";
import { PageTitle } from "@/components/ui/PageTitle";

export default function NotFound() {
  return (
    <PageTitle
      title="Not found"
      subline="There is no discussion or decision at this address. It may not have been ingested yet."
      actions={<ButtonLink href="/">Back to Overview</ButtonLink>}
    />
  );
}
