import { cache } from "react";
import { getSource } from "./source";

// generateMetadata and the page both need the same topic or decision. React's cache() dedupes the
// call within one server request, so each page asks the API once instead of twice.

export const getTopicOnce = cache((slug: string) => getSource().getTopic(slug));

export const getDecisionOnce = cache((id: number) => getSource().getDecision(id));
