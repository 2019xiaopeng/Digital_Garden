const bvid = process.argv[2] || "BV1qG41197E4";
const url = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://www.bilibili.com",
  "Accept": "application/json,text/plain,*/*",
};

async function main() {
  console.log("[probe] requesting:", url);
  const response = await fetch(url, { method: "GET", headers });
  const status = response.status;
  const bodyText = await response.text();

  console.log("[probe] status:", status);
  console.log("[probe] body preview:", bodyText.slice(0, 280));

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch (err) {
    console.error("[probe] JSON parse failed:", err);
    process.exit(2);
  }

  if (payload.code !== 0 || !payload.data) {
    console.error("[probe] bilibili API returned non-zero code:", payload.code, payload.message);
    process.exit(3);
  }

  const result = {
    bvid: payload.data.bvid,
    title: payload.data.title,
    pic: payload.data.pic,
    owner_name: payload.data.owner?.name,
    duration: payload.data.duration,
  };

  console.log("[probe] extracted fields:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[probe] request failed:", err);
  process.exit(1);
});
