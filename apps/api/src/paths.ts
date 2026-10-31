// Where things live on disk, found from the location of this file so it works from anywhere.

import { fileURLToPath } from "node:url";

/** The root of the repository. */
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Uploaded discussions are written here. It is git-ignored. */
export const UPLOAD_DIR = fileURLToPath(new URL("../../../data/uploads/", import.meta.url));
