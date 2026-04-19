import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEpisodeMatchers,
  chooseTargetFile,
  rankCandidates,
  type RDTorrentFile,
} from "./stream-resolver-utils.ts";

describe("stream resolver utilities", () => {
  it("buildEpisodeMatchers includes common patterns", () => {
    const matchers = buildEpisodeMatchers(1, 3);
    const samples = ["Show.S01E03.1080p", "Show 1x3 WEB-DL", "season 1 episode 3"];
    for (const s of samples) {
      assert.equal(
        matchers.some((rx) => rx.test(s)),
        true,
      );
    }
  });

  it("rankCandidates prioritizes TV candidate that matches season/episode", () => {
    const ranked = rankCandidates(
      [
        { infoHash: "a", magnet: "magnet:?xt=urn:btih:a", title: "Show.S01E02.1080p" },
        { infoHash: "b", magnet: "magnet:?xt=urn:btih:b", title: "Show.S01E03.720p" },
      ],
      { type: "tv", season: 1, episode: 3 },
    );

    assert.equal(ranked[0].infoHash, "b");
  });

  it("chooseTargetFile prefers explicit episode match for TV", () => {
    const files: RDTorrentFile[] = [
      { id: 1, path: "/Show.S01E02.mkv", bytes: 1_000_000_000 },
      { id: 2, path: "/Show.S01E03.mkv", bytes: 900_000_000 },
      { id: 3, path: "/sample.mkv", bytes: 5_000_000 },
    ];

    const picked = chooseTargetFile(files, { type: "tv", season: 1, episode: 3 });
    assert.equal(picked?.id, 2);
  });

  it("chooseTargetFile falls back to largest video for movies", () => {
    const files: RDTorrentFile[] = [
      { id: 1, path: "/movie-480p.mp4", bytes: 700_000_000 },
      { id: 2, path: "/movie-1080p.mkv", bytes: 2_100_000_000 },
      { id: 3, path: "/readme.txt", bytes: 1_000 },
    ];

    const picked = chooseTargetFile(files, { type: "movie" });
    assert.equal(picked?.id, 2);
  });
});
