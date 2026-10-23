# Connecting your data (owner steps, word for word)

Agents: relay these steps as written, one connection at a time, and run the matching `scripts/setup/connect.py` command as soon as the owner hands something over. Never ask the owner to paste a JSON key file into chat; ask them to download it. The script finds it in Downloads.

Fallback if the owner can't do a step today: OpenSEO (if connected) already reads Search Console performance data for free. Use it, and note that index status needs the steps below.

## 1. Google Search Console (about 10 minutes)

What it unlocks: index status per page (URL Inspection), sitemaps, clicks/impressions/queries.

1. Go to https://console.cloud.google.com and pick (or create) a project. Any project works, including one made for another integration.
2. **APIs & Services > Library**: search **Google Search Console API** and click **Enable**. While you're there, also enable **PageSpeed Insights API** (used in step 3 below).
3. **IAM & Admin > Service Accounts > Create service account**. Name it `seo-reader`, click **Create and continue**, skip roles, and click **Done**.
4. Click the new account, open the **Keys** tab, then **Add key > Create new key > JSON > Create**. A file named like `<project>-1a2b3c.json` downloads. Leave it in Downloads.
5. Tell the agent "downloaded". The agent runs `python scripts/setup/connect.py gsc --find`, which moves the file somewhere safe and prints **the email to add**.
   - The key download never shows an email. The email is the service account's own address (`seo-reader@<project>.iam.gserviceaccount.com`). It is listed on the Service Accounts page, and the script reads it from the file.
6. In https://search.google.com/search-console open the site, then **Settings > Users and permissions > Add user**. Paste that email, choose **Full**, and click **Add**.
7. The agent runs `python scripts/setup/connect.py gsc --test`. Allow a minute after step 6.

## 2. Bing Webmaster Tools (2 minutes)

What it unlocks: Bing traffic, crawl stats, index count, URL and sitemap submission. ChatGPT search and Copilot use Bing's index.

1. Go to https://www.bing.com/webmasters. If the site isn't added yet, use **Import from Google Search Console** (fastest).
2. Open **Settings** (gear icon, top right) > **API access** > **API Key** > **Generate**.
3. Paste the key to the agent. It runs `python scripts/setup/connect.py bing --key <key>`, which checks the key with Bing before saving it.

## 3. PageSpeed / Core Web Vitals (optional, 1 minute)

1. Same Google Cloud project: **APIs & Services > Credentials > Create credentials > API key**. Optionally restrict it to PageSpeed Insights API.
2. Paste it to the agent: `python scripts/setup/connect.py pagespeed --key <key>`.

## After connecting

- Run `python scripts/setup/connect.py status`.
- Restart Claude Code once so the MCP server picks up the new settings.
- If the MCP server says "Connection closed", Python is missing packages: run `python scripts/setup/connect.py deps`, then restart.
