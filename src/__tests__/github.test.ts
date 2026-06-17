import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@octokit/rest");

import { Octokit } from "@octokit/rest";
import { postOrUpdateComment } from "../github";

const mockListComments = vi.fn();
const mockUpdateComment = vi.fn();
const mockCreateComment = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Octokit).mockImplementation(
    () =>
      ({
        pulls: { listFiles: vi.fn() },
        issues: {
          listComments: mockListComments,
          updateComment: mockUpdateComment,
          createComment: mockCreateComment,
        },
      }) as unknown as InstanceType<typeof Octokit>,
  );
});

describe("postOrUpdateComment", () => {
  it("creates a new comment if no marker exists in any comment body", async () => {
    // spec: postOrUpdateComment — creates new comment if none with marker exists
    mockListComments.mockResolvedValue({ data: [] });
    mockCreateComment.mockResolvedValue({
      data: { html_url: "https://github.com/org/repo/pull/1#issuecomment-1" },
    });

    const url = await postOrUpdateComment(
      "token",
      "org",
      "repo",
      1,
      "review body",
      "<!-- finvalidate-review -->",
    );

    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: "org",
      repo: "repo",
      issue_number: 1,
      body: "review body",
    });
    expect(mockUpdateComment).not.toHaveBeenCalled();
    expect(url).toBe("https://github.com/org/repo/pull/1#issuecomment-1");
  });

  it("updates existing comment when marker is found in its body", async () => {
    // spec: postOrUpdateComment — updates existing comment if marker found in body
    mockListComments.mockResolvedValue({
      data: [
        {
          id: 42,
          body: "<!-- finvalidate-review -->\n## FinValidate Review\n\nold content",
        },
      ],
    });
    mockUpdateComment.mockResolvedValue({
      data: { html_url: "https://github.com/org/repo/pull/1#issuecomment-42" },
    });

    const url = await postOrUpdateComment(
      "token",
      "org",
      "repo",
      1,
      "updated review",
      "<!-- finvalidate-review -->",
    );

    expect(mockUpdateComment).toHaveBeenCalledWith({
      owner: "org",
      repo: "repo",
      comment_id: 42,
      body: "updated review",
    });
    expect(mockCreateComment).not.toHaveBeenCalled();
    expect(url).toBe("https://github.com/org/repo/pull/1#issuecomment-42");
  });

  it("returns html_url from the created comment", async () => {
    // spec: postOrUpdateComment — returns html_url in both create and update paths
    mockListComments.mockResolvedValue({ data: [] });
    mockCreateComment.mockResolvedValue({
      data: { html_url: "https://expected-url.com" },
    });

    const url = await postOrUpdateComment(
      "token",
      "org",
      "repo",
      1,
      "body",
      "<!-- marker -->",
    );

    expect(url).toBe("https://expected-url.com");
  });
});
