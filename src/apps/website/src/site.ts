/** Public address of the site. Replace the placeholder when the domain is set. */
export const SITE_URL = "https://lustre.example";

export const REPO_URL = "https://github.com/schedawg74/lustre";

/** Target of every install button. Point it to the Chrome Web Store listing once it exists. */
export const INSTALL_URL = `${REPO_URL}#install-unpacked`;

/**
 * Base URL of the Lustre server for the public stats, set at build time with
 * PUBLIC_API_URL. Empty until the server is live: the page then shows sample data.
 */
export const API_URL: string = import.meta.env.PUBLIC_API_URL ?? "";
