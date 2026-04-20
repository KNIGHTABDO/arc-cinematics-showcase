import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEpisodeMatchers,
  chooseTargetFile,
  chooseTargetFileDetailed,
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

  it("rankCandidates prefers selected quality when requested", () => {
    const ranked = rankCandidates(
      [
        { infoHash: "a", magnet: "magnet:?xt=urn:btih:a", title: "Movie.2160p.WEB-DL" },
        { infoHash: "b", magnet: "magnet:?xt=urn:btih:b", title: "Movie.1080p.WEB-DL" },
      ],
      { type: "movie", preferredQuality: "1080" },
    );

    assert.equal(ranked[0].infoHash, "b");
  });

  it("rankCandidates prefers x264 over x265 for same quality in browser playback", () => {
    const ranked = rankCandidates(
      [
        { infoHash: "a", magnet: "magnet:?xt=urn:btih:a", title: "Show.S01E01.1080p.WEB-DL.x265" },
        { infoHash: "b", magnet: "magnet:?xt=urn:btih:b", title: "Show.S01E01.1080p.WEB-DL.x264" },
      ],
      { type: "tv", season: 1, episode: 1, preferredQuality: "1080" },
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

  it("chooseTargetFile prefers browser-friendly container for movies", () => {
    const files: RDTorrentFile[] = [
      { id: 1, path: "/movie-480p.mp4", bytes: 700_000_000 },
      { id: 2, path: "/movie-1080p.mkv", bytes: 2_100_000_000 },
      { id: 3, path: "/readme.txt", bytes: 1_000 },
    ];

    const picked = chooseTargetFile(files, { type: "movie" });
    assert.equal(picked?.id, 1);
  });

  it("chooseTargetFile prefers preferredFileIdx mappings before episode fallback", () => {
    const files: RDTorrentFile[] = [
      { id: 10, path: "/Show.S01E01.mkv", bytes: 1_100_000_000 },
      { id: 11, path: "/Show.S01E02.mkv", bytes: 1_100_000_000 },
      { id: 12, path: "/Show.S01E03.mkv", bytes: 1_100_000_000 },
    ];

    const byIndex = chooseTargetFile(files, { type: "tv", season: 1, episode: 3, preferredFileIdx: 1 });
    assert.equal(byIndex?.id, 11);

    const byId = chooseTargetFile(files, { type: "tv", season: 1, episode: 3, preferredFileIdx: 12 });
    assert.equal(byId?.id, 12);

    const byIdPlusOne = chooseTargetFile(files, {
      type: "tv",
      season: 1,
      episode: 3,
      preferredFileIdx: 11,
    });
    assert.equal(byIdPlusOne?.id, 11);
  });

  it("chooseTargetFile prioritizes mkv over mp4 when bytes are similar to leverage the proxy", () => {
    const files: RDTorrentFile[] = [
      { id: 1, path: "/Show.S01E01.1080p.mkv", bytes: 1_000_000_000 },
      { id: 2, path: "/Show.S01E01.1080p.mp4", bytes: 1_000_000_000 },
    ];

    const picked = chooseTargetFile(files, { type: "tv", season: 1, episode: 1 });
    assert.equal(picked?.id, 1);
  });

  it("returns largest non-extra episode when no explicit episode match exists", () => {
    const files: RDTorrentFile[] = [
      { id: 1, path: "/FROM/Extras/featurette.mkv", bytes: 50_000_000 },
      { id: 2, path: "/FROM/sample.mkv", bytes: 10_000_000 },
      { id: 3, path: "/FROM/Episode.03.mkv", bytes: 900_000_000 },
      { id: 4, path: "/FROM/Episode.04.mkv", bytes: 1_100_000_000 },
    ];

    const picked = chooseTargetFile(files, { type: "tv", season: 1, episode: 1 });
    assert.equal(picked?.id, 4);
  });
});
