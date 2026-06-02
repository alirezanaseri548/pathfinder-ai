import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  generateGeminiContent: vi.fn(),
  buildSecurePrompt: vi.fn(),
  auth: vi.fn(),
  db: {
    user: {
      findUnique: vi.fn(),
    },
  },
  consoleError: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/gemini", () => ({
  generateGeminiContent: mocks.generateGeminiContent,
}));

vi.mock("@/lib/prompt-safety", async () => {
  const actual = await vi.importActual("@/lib/prompt-safety");
  return {
    ...actual,
    buildSecurePrompt: mocks.buildSecurePrompt,
  };
});

// const consoleErrorSpy = vi
//   .spyOn(console, "error")
//   .mockImplementation(() => {});

import { chatWithGemini } from "../actions/chat.js";

describe("chatWithGemini", () => {
  beforeEach(() => {
    // Set up default mock for auth to return no user (null userId)
    mocks.auth.mockResolvedValue({ userId: null });
  });
  it("requires a prompt", async () => {
    await expect(chatWithGemini("")).rejects.toThrow("Prompt is required");
  });

  it("wraps the prompt before sending it to Gemini", async () => {
    mocks.buildSecurePrompt.mockReturnValue("secure prompt");
    mocks.generateGeminiContent.mockResolvedValue({
      response: { text: () => "career advice" },
    });

    await expect(chatWithGemini("How do I improve my resume?")).resolves.toBe(
      "career advice"
    );

    expect(mocks.buildSecurePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        untrustedData: [
          {
            label: "userQuery",
            value: "How do I improve my resume?",
            maxLength: 4000,
          },
        ],
      })
    );
    expect(mocks.generateGeminiContent).toHaveBeenCalledWith("secure prompt");
  });

  it("normalizes Gemini errors", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.buildSecurePrompt.mockReturnValue("secure prompt");
    mocks.generateGeminiContent.mockRejectedValue(new Error("quota exceeded"));

    await expect(chatWithGemini("Help me with interviews")).rejects.toThrow(
      "Failed to get response from Gemini AI"
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});