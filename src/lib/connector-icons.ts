/**
 * Bundled brand marks for the Apps catalog.
 *
 * The catalog ships `logo: null` for every curated toolkit and used to rely on
 * `google.com/s2/favicons`, which often cannot resolve from mainland China, so the
 * whole list degraded to grey initials. These files live in
 * `public/app-icons/connectors/` (Simple Icons paths, official brand colours) so
 * the list renders offline.
 *
 * Keys are the catalog slugs the Composio driver uses, not the Simple Icons slugs
 * (`twitter` is X's mark, `jira` is Atlassian's Jira mark).
 */
const CONNECTOR_ICONS: Readonly<Record<string, string>> = {
  slack: "/app-icons/connectors/slack.svg",
  github: "/app-icons/connectors/github.svg",
  gmail: "/app-icons/connectors/gmail.svg",
  googlecalendar: "/app-icons/connectors/googlecalendar.svg",
  googlesheets: "/app-icons/connectors/googlesheets.svg",
  googledocs: "/app-icons/connectors/googledocs.svg",
  googledrive: "/app-icons/connectors/googledrive.svg",
  notion: "/app-icons/connectors/notion.svg",
  linear: "/app-icons/connectors/linear.svg",
  sentry: "/app-icons/connectors/sentry.svg",
  posthog: "/app-icons/connectors/posthog.svg",
  discord: "/app-icons/connectors/discord.svg",
  twitter: "/app-icons/connectors/twitter.svg",
  reddit: "/app-icons/connectors/reddit.svg",
  zapier: "/app-icons/connectors/zapier.svg",
  hubspot: "/app-icons/connectors/hubspot.svg",
  salesforce: "/app-icons/connectors/salesforce.svg",
  jira: "/app-icons/connectors/jira.svg",
  atlassian: "/app-icons/connectors/jira.svg",
  asana: "/app-icons/connectors/asana.svg",
  trello: "/app-icons/connectors/trello.svg",
  dropbox: "/app-icons/connectors/dropbox.svg",
  airtable: "/app-icons/connectors/airtable.svg",
  figma: "/app-icons/connectors/figma.svg",
  stripe: "/app-icons/connectors/stripe.svg",
};

/** A bundled mark for this catalog slug, if the build ships one. */
export function connectorIcon(slug?: string | null): string | undefined {
  const key = slug?.trim().toLowerCase();
  return key ? CONNECTOR_ICONS[key] : undefined;
}
