---
name: agent-reach
description: >
  Use the internet: search, read, and interact with 13+ platforms including
  Twitter/X, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu (小红书), Douyin (抖音),
  WeChat Articles (微信公众号), LinkedIn, Boss直聘, RSS, Exa web search, and any web page.
  Use when: (1) user asks to search or read any of these platforms,
  (2) user shares a URL from any supported platform,
  (3) user asks to search the web, find information online, or research a topic,
  (4) user asks to post, comment, or interact on supported platforms,
  (5) user asks to configure or set up a platform channel.
  Triggers: "搜推特", "搜小红书", "看视频", "搜一下", "上网搜", "帮我查", "全网搜索",
  "search twitter", "read tweet", "youtube transcript", "search reddit",
  "read this link", "看这个链接", "B站", "bilibili", "抖音视频",
  "微信文章", "公众号", "LinkedIn", "GitHub issue", "RSS",
  "search online", "web search", "find information", "research",
  "帮我配", "configure twitter", "configure proxy", "帮我安装".
---

# Agent Reach — Usage Guide

Upstream tools for 13+ platforms. Call them directly.

Run `agent-reach doctor` to check which channels are available.

## ⚠️ Workspace Rules

**Never create files in the agent workspace.** Use `/tmp/` for temporary output and `~/.agent-reach/` for persistent data.

## Web — Any URL

```bash
curl -s "https://r.jina.ai/URL"
```

## Web Search (Exa)

```bash
mcporter call 'exa.web_search_exa(query: "query", numResults: 5)'
mcporter call 'exa.get_code_context_exa(query: "code question", tokensNum: 3000)'
```

## Twitter/X (xreach)

```bash
xreach search "query" -n 10 --json          # search
xreach tweet URL_OR_ID --json                # read tweet (supports /status/ and /article/ URLs)
xreach tweets @username -n 20 --json         # user timeline
xreach thread URL_OR_ID --json               # full thread
```

## YouTube — Three-Tier Transcription Strategy

When a user shares a YouTube URL or asks to transcribe/summarize a YouTube video, follow this **three-tier fallback strategy** in order. Do NOT skip tiers — try each one before falling back.

### Prerequisites

- yt-dlp is configured with proxy and cookies at `~/.config/yt-dlp/config`
- deno JS runtime is at `~/.deno/bin/deno` (add to PATH: `export PATH="$HOME/.deno/bin:$PATH"`)
- ffmpeg is available for audio extraction
- mihomo proxy runs on `socks5://127.0.0.1:7891` (YouTube domains only)

### Tier 1: yt-dlp Subtitles (preferred — fastest, most accurate)

```bash
export PATH="$HOME/.deno/bin:$PATH"

# Step 1: Get video metadata
yt-dlp --dump-json "URL" 2>/dev/null | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'Title: {d.get(\"title\")}')
print(f'Channel: {d.get(\"channel\")}')
print(f'Duration: {d.get(\"duration\")}s')
print(f'Description: {d.get(\"description\",\"\")[:3000]}')
"

# Step 2: Download subtitles (auto-generated + manual)
yt-dlp --write-sub --write-auto-sub --sub-lang "zh-Hans,zh,en" --sub-format vtt \
  --skip-download -o "/tmp/yt_%(id)s" "URL"

# Step 3: Read and parse the .vtt file
# Priority: zh-Hans > zh > en
python3 -c "
import re, glob
for lang in ['zh-Hans', 'zh', 'en']:
    files = glob.glob(f'/tmp/yt_*{lang}.vtt')  # use the actual video ID
    if files:
        with open(files[0]) as f:
            lines = f.read()
        # Remove VTT headers, timestamps, and formatting tags
        lines = re.sub(r'WEBVTT.*?\n\n', '', lines, flags=re.DOTALL)
        lines = re.sub(r'\d{2}:\d{2}:\d{2}\.\d{3} --> .*\n', '', lines)
        lines = re.sub(r'<[^>]+>', '', lines)
        lines = re.sub(r'align:start position:\d+%', '', lines)
        # Deduplicate consecutive identical lines
        seen = []
        for line in lines.strip().split('\n'):
            line = line.strip()
            if line and (not seen or line != seen[-1]):
                seen.append(line)
        print('\n'.join(seen))
        break
"
```

**If Tier 1 fails** (no subtitles, `has no automatic captions`, or download error) → proceed to Tier 2.

### Tier 2: Web Content Extraction (fallback — grab description + author's notes)

```bash
# Step 1: Fetch the YouTube page via Jina Reader for description, chapters, comments
curl -sL "https://r.jina.ai/URL" -H "Accept: text/markdown" | head -500

# Step 2: Look for author's blog/notes links in the description
# Common patterns: aivi.fyi, notion.so, github.com, medium.com, substack.com
# If found, fetch those too:
curl -sL "https://r.jina.ai/BLOG_URL" -H "Accept: text/markdown"
```

**If Tier 2 content is insufficient** (description too short, no blog links, chapters don't provide enough detail) → proceed to Tier 3.

### Tier 3: Audio Download + Whisper ASR (last resort — full transcription)

```bash
export PATH="$HOME/.deno/bin:$PATH"

# Step 1: Download audio only
yt-dlp -x --audio-format mp3 --audio-quality 5 -o "/tmp/yt_%(id)s.%(ext)s" "URL"

# Step 2: Transcribe with OpenAI Whisper API (preferred — fast, accurate, no local GPU needed)
curl -s https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F file="@/tmp/yt_VIDEO_ID.mp3" \
  -F model="whisper-1" \
  -F language="zh" \
  -F response_format="text" \
  -o /tmp/yt_VIDEO_ID_transcript.txt

# Step 3: Read the transcript
cat /tmp/yt_VIDEO_ID_transcript.txt

# Clean up
rm -f /tmp/yt_VIDEO_ID.mp3 /tmp/yt_VIDEO_ID_transcript.txt
```

> **Note on Whisper**: If no OPENAI_API_KEY is available, use local whisper:
> `pip3 install --break-system-packages openai-whisper && whisper /tmp/yt_VIDEO_ID.mp3 --model small --language zh`
> CPU-only: ~5-15 min for a 10-min video with `small` model.

### YouTube Search

```bash
export PATH="$HOME/.deno/bin:$PATH"
yt-dlp --dump-json "ytsearch5:query"         # search top 5 results
```

### Cleanup Rule

Always clean up temporary files after processing:
```bash
rm -f /tmp/yt_VIDEO_ID*
```

## Bilibili (yt-dlp)

```bash
yt-dlp --dump-json "https://www.bilibili.com/video/BVxxx"
yt-dlp --write-sub --write-auto-sub --sub-lang "zh-Hans,zh,en" --convert-subs vtt --skip-download -o "/tmp/%(id)s" "URL"
```

> Server IPs may get 412. Use `--cookies-from-browser chrome` or configure proxy.

## Reddit

```bash
curl -s "https://www.reddit.com/r/SUBREDDIT/hot.json?limit=10" -H "User-Agent: agent-reach/1.0"
curl -s "https://www.reddit.com/search.json?q=QUERY&limit=10" -H "User-Agent: agent-reach/1.0"
```

> Server IPs may get 403. Search via Exa instead, or configure proxy.

## GitHub (gh CLI)

```bash
gh search repos "query" --sort stars --limit 10
gh repo view owner/repo
gh search code "query" --language python
gh issue list -R owner/repo --state open
gh issue view 123 -R owner/repo
```

## 小红书 / XiaoHongShu (mcporter)

```bash
mcporter call 'xiaohongshu.search_feeds(keyword: "query")'
mcporter call 'xiaohongshu.get_feed_detail(feed_id: "xxx", xsec_token: "yyy")'
mcporter call 'xiaohongshu.get_feed_detail(feed_id: "xxx", xsec_token: "yyy", load_all_comments: true)'
mcporter call 'xiaohongshu.publish_content(title: "标题", content: "正文", images: ["/path/img.jpg"], tags: ["tag"])'
```

> Requires login. Use Cookie-Editor to import cookies.

## 抖音 / Douyin (mcporter)

```bash
mcporter call 'douyin.parse_douyin_video_info(share_link: "https://v.douyin.com/xxx/")'
mcporter call 'douyin.get_douyin_download_link(share_link: "https://v.douyin.com/xxx/")'
```

> No login needed.

## 微信公众号 / WeChat Articles

**Search** (miku_ai):
```python
python3 -c "
import asyncio
from miku_ai import get_wexin_article
async def s():
    for a in await get_wexin_article('query', 5):
        print(f'{a[\"title\"]} | {a[\"url\"]}')
asyncio.run(s())
"
```

**Read** (Camoufox — bypasses WeChat anti-bot):
```bash
cd ~/.agent-reach/tools/wechat-article-for-ai && python3 main.py "https://mp.weixin.qq.com/s/ARTICLE_ID"
```

> WeChat articles cannot be read with Jina Reader or curl. Must use Camoufox.

## LinkedIn (mcporter)

```bash
mcporter call 'linkedin.get_person_profile(linkedin_url: "https://linkedin.com/in/username")'
mcporter call 'linkedin.search_people(keyword: "AI engineer", limit: 10)'
```

Fallback: `curl -s "https://r.jina.ai/https://linkedin.com/in/username"`

## Boss直聘 (mcporter)

```bash
mcporter call 'bosszhipin.get_recommend_jobs_tool(page: 1)'
mcporter call 'bosszhipin.search_jobs_tool(keyword: "Python", city: "北京")'
```

Fallback: `curl -s "https://r.jina.ai/https://www.zhipin.com/job_detail/xxx"`

## RSS

```python
python3 -c "
import feedparser
for e in feedparser.parse('FEED_URL').entries[:5]:
    print(f'{e.title} — {e.link}')
"
```

## Troubleshooting

- **Channel not working?** Run `agent-reach doctor` — shows status and fix instructions.
- **Twitter fetch failed?** Ensure `undici` is installed: `npm install -g undici`. Configure proxy: `agent-reach configure proxy URL`.

## Setting Up a Channel ("帮我配 XXX")

If a channel needs setup (cookies, Docker, etc.), fetch the install guide:
https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md

User only provides cookies. Everything else is your job.
