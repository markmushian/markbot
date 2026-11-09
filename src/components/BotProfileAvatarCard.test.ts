import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StoreProvider, type Bot } from "@/state/store";
import { BotProfileAvatarCard } from "./BotProfileAvatarCard";

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: "bot-1",
    threadId: "thread-1",
    name: "Maus",
    title: "Maus",
    description: "",
    notifications: false,
    color: "green",
    unread: false,
    modelSelection: { instanceId: "local", model: "test-model" },
    messages: [],
    ...overrides,
  };
}

function renderCard(bot: Bot) {
  return renderToStaticMarkup(
    createElement(
      StoreProvider,
      null,
      createElement(BotProfileAvatarCard, {
        bot,
        activeState: "idle",
        mascotMotion: null,
        onPatch: vi.fn(),
      }),
    ),
  );
}

describe("BotProfileAvatarCard", () => {
  it("no longer offers the body picker or the Halloween costumes", () => {
    const markup = renderCard(makeBot({ mascotBody: "star" }));

    expect(markup).not.toContain(">Body<");
    expect(markup).not.toContain(">Halloween<");
    expect(markup).not.toContain(' body"');
    expect(markup).not.toContain("data-halloween-bodies");
  });

  it("still offers the mascot colours", () => {
    expect(renderCard(makeBot())).toContain('aria-label="Use green mascot color"');
  });

  it("hides the colours for a flat image crop", () => {
    for (const crop of ["circle", "rounded", "square"] as const) {
      expect(renderCard(makeBot({ avatarCrop: crop }))).not.toContain('aria-label="Use green mascot color"');
    }
  });

  it("offers zoom and drag framing for a custom image", () => {
    const markup = renderCard(makeBot({
      avatarUrl: "/api/attachments/cat.webp",
      avatarCrop: "circle",
      avatarZoom: 1.5,
    }));
    expect(markup).toContain('aria-label="Zoom avatar"');
    expect(markup).toContain("Drag the picture to reposition it");
    expect(markup).toContain("150%");
    expect(markup).toContain("Reset framing");
  });

  it("hides zoom controls for the mascot", () => {
    const markup = renderCard(makeBot());
    expect(markup).not.toContain('aria-label="Zoom avatar"');
  });

  it("previews a picked image while a new bot is still a draft", () => {
    const draft = renderCard(makeBot({ id: "draft-1", avatarUrl: "blob:https://localhost/avatar-2", avatarCrop: "circle" }));
    const saved = renderCard(makeBot({ avatarUrl: "blob:https://localhost/avatar-2", avatarCrop: "circle" }));
    expect(draft).toContain('src="blob:https://localhost/avatar-2"');
    expect(saved).not.toContain('src="blob:https://localhost/avatar-2"');
  });
});
