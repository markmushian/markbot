import { useState } from "react";
import { cn } from "@/lib/cn";
import { connectorIcon } from "@/lib/connector-icons";

/** One connectable app as the Apps catalog lists it. */
export interface ToolkitCard {
  slug: string;
  label: string;
  blurb: string;
  logo: string | null;
  noAuth?: boolean;
  domain: string | null;
  categories?: string[];
}

/** Marketplace logos are sometimes a marketplace placeholder rather than the
 * product's own mark. These slugs always use the bundled official icon. */
const BUNDLED_LOGOS: Record<string, string> = {
  github: "/app-icons/github.png",
  githubcopilot: "/app-icons/github.png",
  "github-copilot": "/app-icons/github.png",
  github_copilot: "/app-icons/github.png",
};

/** A bundled app mark, then the catalog logo, then its site's favicon, then its initial. */
export function ServiceIcon({ card, className = "size-11" }: { card: Pick<ToolkitCard, "logo" | "domain" | "label"> & { slug?: string }; className?: string }) {
  const bundled = BUNDLED_LOGOS[card.slug?.toLowerCase() ?? ""] ?? connectorIcon(card.slug);
  const logo = bundled ?? card.logo;
  const [stage, setStage] = useState(logo ? 0 : card.domain ? 1 : 2);
  if (stage === 0 && logo) {
    return (
      <img
        src={logo}
        alt=""
        loading="lazy"
        className={cn("rounded-xl object-contain", className)}
        onError={() => setStage(1)}
      />
    );
  }
  if (stage === 1 && card.domain) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${card.domain}&sz=64`}
        alt=""
        loading="lazy"
        className={cn("rounded-xl object-contain", className)}
        onError={() => setStage(2)}
      />
    );
  }
  return (
    <div className={cn("flex items-center justify-center rounded-xl bg-raised text-lead font-semibold text-ink-secondary", className)}>
      {card.label.slice(0, 1).toUpperCase()}
    </div>
  );
}
