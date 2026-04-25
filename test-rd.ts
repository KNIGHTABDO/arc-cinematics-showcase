async function checkInstantAvailability(hash: string) {
  const RD_TOKEN = process.env.VITE_REAL_DEBRID_TOKEN;
  const res = await fetch(
    `https://api.real-debrid.com/rest/1.0/torrents/instantAvailability/${hash.toLowerCase()}`,
    {
      headers: { Authorization: `Bearer ${RD_TOKEN}` },
    },
  );
  if (!res.ok) return false;
  const data = await res.json();
  const hosters = data[hash.toLowerCase()];
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

  const res = await fetch(url);
  const data = await res.json();

  const rawStreams = Array.isArray(data?.streams) ? data.streams : [];

  let candidates = rawStreams
    .filter((s: any) => typeof s?.name === "string" && s.name.includes("[RD+]"))
    .map((s: any) => {
      const parts = s.url.split("/");
      const infoHash = parts[parts.length - 1];

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
    const isCam = /cam|hdcam|ts|telesync|hdts|line/i.test(titleLower);

    if (preferredAudioLanguage === "en" && isDubbed) langScore -= 1000;
    if (isCam) langScore -= 5000;

    let codecScore = 0;
    // Chrome strictly DOES NOT support AC3, EAC3, TrueHD, DTS natively without HLS.
    if (/ac3|eac3|dd5\.1|truehd|dts|atmos|pcm/i.test(titleLower)) codecScore -= 5000;
    // Chrome strictly DOES NOT support HEVC/H.265 natively in most setups.
    if (/hevc|h265|x265/i.test(titleLower)) codecScore -= 5000;

    // Chrome LOVES AAC, Opus, MP3, FLAC + H.264
    if (/aac|opus|mp3/i.test(titleLower)) codecScore += 2000;
    if (/h264|x264|avc/i.test(titleLower)) codecScore += 2000;
    if (titleLower.includes("mp4")) codecScore += 1000;

    let qualityScore = 0;
    const is4k = /2160|4k|uhd/i.test(titleLower);
    const is8k = /4320|8k/i.test(titleLower);
    const is1080 = /1080/i.test(titleLower);
    const is720 = /720/i.test(titleLower);
    const sizeGB = c.sizeBytes / 1e9;

    if (sizeGB > 25) qualityScore -= 5000;
    else if (sizeGB > 15) qualityScore -= 2000;

    if (preferredQuality === "1080") {
      if (is1080) qualityScore += 1000;
      if (is4k || is8k) qualityScore -= 3000; // Strict downgrade
    } else if (preferredQuality === "720") {
      if (is720) qualityScore += 1000;
      if (is1080 || is4k || is8k) qualityScore -= 3000;
    } else if (preferredQuality === "2160") {
      if (is4k) qualityScore += 1000;
      if (is8k) qualityScore -= 3000;
    } else {
      // Auto
      if (is1080) qualityScore += 1000;
      if (is4k) qualityScore += 500;
      if (is8k) qualityScore -= 3000;
    }

    return { ...c, isCached, langScore, codecScore, qualityScore, sizeGB };
  });

  ranked.sort((a, b) => {
    if (a.qualityScore !== b.qualityScore) return b.qualityScore - a.qualityScore;
    if (a.codecScore !== b.codecScore) return b.codecScore - a.codecScore;
    if (a.langScore !== b.langScore) return b.langScore - a.langScore;
    if (a.isCached && !b.isCached) return -1;
    if (!a.isCached && b.isCached) return 1;

    const isIdealA = a.sizeGB >= 1.5 && a.sizeGB <= 8.5;
    const isIdealB = b.sizeGB >= 1.5 && b.sizeGB <= 8.5;

    if (isIdealA && !isIdealB) return -1;
    if (!isIdealA && isIdealB) return 1;

    return a.sizeGB - b.sizeGB;
  });

  console.log(`\n--- TOP 3 SELECTIONS ---`);
  ranked.slice(0, 3).forEach((r, i) => {
    console.log(`\n#${i + 1}: ${r.sizeGB.toFixed(2)} GB | Cached: ${r.isCached}`);
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
