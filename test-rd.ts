async function checkInstantAvailability(hash: string) {
  const RD_TOKEN = process.env.VITE_REAL_DEBRID_TOKEN;
  const res = await fetch(
    `https://api.real-debrid.com/rest/1.0/torrents/instantAvailability/${hash}`,
    {
      headers: { Authorization: `Bearer ${RD_TOKEN}` },
    },
  );
  const data = await res.json();
  const hosters = data[hash];
  if (!hosters || !hosters.rd || !hosters.rd.length) return false;
  return true;
}

async function testScoring(
  imdbId: string,
  titleName: string,
  preferredAudioLanguage = "en",
  preferredQuality = "auto",
) {
  console.log(`\n===========================================`);
  console.log(`TESTING: ${titleName} (${imdbId})`);
  console.log(`===========================================`);

  const RD_TOKEN = process.env.VITE_REAL_DEBRID_TOKEN;
  const url = `https://torrentio.strem.fun/realdebrid=${RD_TOKEN}/stream/movie/${imdbId}.json`;

  console.log(`Fetching from Torrentio...`);
  const res = await fetch(url);
  const data = await res.json();

  const rawStreams = Array.isArray(data?.streams) ? data.streams : [];
  console.log(`Found ${rawStreams.length} total streams.`);

  let candidates = rawStreams
    .filter((s: any) => typeof s?.name === "string" && s.name.includes("[RD+]"))
    .map((s: any) => {
      const parts = s.url.split("/");
      const infoHash = parts[parts.length - 1]; // naive extract for test

      const title = String(s?.title || s?.name || "Unknown");
      let sizeBytes = 0;
      const sizeMatch = title.match(/💾\s*([\d.]+)\s*(GB|MB)/i);
      if (sizeMatch) {
        const val = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2].toUpperCase();
        if (unit === "GB") sizeBytes = val * 1024 * 1024 * 1024;
        else if (unit === "MB") sizeBytes = val * 1024 * 1024;
      }
      return { infoHash, title, sizeBytes, url: s.url };
    });

  console.log(`Found ${candidates.length} [RD+] candidates.`);

  const checkCount = Math.min(candidates.length, 15);
  const availResults = await Promise.allSettled(
    candidates.slice(0, checkCount).map((c) => checkInstantAvailability(c.infoHash)),
  );

  const ranked = candidates.slice(0, checkCount).map((c, i) => {
    const isCached =
      availResults[i].status === "fulfilled" ? (availResults[i] as any).value : false;

    let langScore = 0;
    const titleLower = c.title.toLowerCase();
    const isDubbed = /lat|dual|ita|spa|ger|fre|fra|rus|hin|tel|tam|dub/i.test(titleLower);

    if (preferredAudioLanguage === "en") {
      if (isDubbed) langScore -= 100;
    }

    let codecScore = 0;
    if (/truehd|dts|flac|atmos|pcm/i.test(titleLower)) codecScore -= 1000;
    if (/hevc|h265|x265/i.test(titleLower)) codecScore -= 2000;
    if (/h264|x264|avc/i.test(titleLower)) codecScore += 1000;
    if (/aac|eac3|ac3|dd5\.1/i.test(titleLower)) codecScore += 500;
    if (titleLower.includes("mp4")) codecScore += 500;

    let qualityScore = 0;
    const is2160 = /2160|4k/i.test(titleLower);
    const is1080 = /1080/i.test(titleLower);
    const is720 = /720/i.test(titleLower);

    if (preferredQuality === "1080") {
      if (is1080) qualityScore += 1000;
      if (is2160) qualityScore -= 500; // Penalize 4K if 1080p requested
    } else if (preferredQuality === "2160") {
      if (is2160) qualityScore += 1000;
    } else if (preferredQuality === "720") {
      if (is720) qualityScore += 1000;
      if (is2160 || is1080) qualityScore -= 500;
    } else {
      // Auto (default) - Try to get highest possible that fits constraints
      if (is1080) qualityScore += 500;
      if (is2160) qualityScore += 800; // But HEVC penalty might still block it
    }

    return { ...c, isCached, langScore, codecScore, qualityScore };
  });

  ranked.sort((a, b) => {
    if (a.codecScore !== b.codecScore) return b.codecScore - a.codecScore;
    if (a.qualityScore !== b.qualityScore) return b.qualityScore - a.qualityScore;
    if (a.langScore !== b.langScore) return b.langScore - a.langScore;
    if (a.isCached && !b.isCached) return -1;
    if (!a.isCached && b.isCached) return 1;

    const sizeA_GB = a.sizeBytes / 1e9;
    const sizeB_GB = b.sizeBytes / 1e9;

    const isIdealA = sizeA_GB >= 1.5 && sizeA_GB <= 8.5;
    const isIdealB = sizeB_GB >= 1.5 && sizeB_GB <= 8.5;

    if (isIdealA && !isIdealB) return -1;
    if (!isIdealA && isIdealB) return 1;

    return sizeA_GB - sizeB_GB;
  });

  console.log(`\n--- TOP 5 SELECTIONS ---`);
  ranked.slice(0, 5).forEach((r, i) => {
    console.log(`\n#${i + 1}: ${(r.sizeBytes / 1e9).toFixed(2)} GB | Cached: ${r.isCached}`);
    console.log(`Title: ${r.title.replace(/\n/g, " ")}`);
    console.log(
      `Scores -> Codec: ${r.codecScore}, Quality: ${r.qualityScore}, Lang: ${r.langScore}`,
    );
  });
}

async function run() {
  await testScoring("tt12042730", "Project Hail Mary", "en", "auto");
  await testScoring("tt0071562", "The Godfather Part II", "en", "auto");
  await testScoring("tt0468569", "The Dark Knight", "en", "1080");
}

run();
