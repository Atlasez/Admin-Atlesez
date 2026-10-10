export type XaiStory = {
  slug: string;
  title: string;
  date: string;
  category: string;
  summary?: string;
  tone: "orange" | "pink" | "blue" | "teal" | "violet" | "green";
};

// Titles, dates, and links were transcribed from the public news index. Article
// bodies stay on the official site rather than being copied into this prototype.
const entries = `grok-4-7|Sep 21, 2026|Product|blue|Introducing Grok 4.7
team-bots|Sep 28, 2026|Product|orange|Team Bots: shared AI teammates that learn as they work
grok-bot-customer-support|Sep 22, 2026|Product|pink|How SpaceXAI is using Grok Bot to scale customer support
grok-voice-transcribe-2|Sep 18, 2026|Product|orange|Introducing Grok Voice Transcribe 2.0
grok-build-memory|Sep 16, 2026|Product|teal|Memory in Grok Build
grok-bot-procurement|Sep 4, 2026|Product|orange|Setting Grok Bot loose on procurement
designing-grok-bot|Sep 3, 2026|Engineering|violet|Designing Grok Bot for a world of persistent agents
grok-bot-for-enterprise|Sep 3, 2026|Product|orange|Grok Bot for Enterprise
biosafety-at-the-frontier|Sep 1, 2026|Research|green|Biosecurity at the frontier
grok-bot-and-x|Aug 29, 2026|Product|orange|Grok Bot now works with X
grok-4-6-microsoft-foundry|Aug 26, 2026|Product|blue|Grok 4.6 on Microsoft Foundry
grok-bot-more-plans|Aug 26, 2026|Product|orange|Grok Bot is now included with more plans
grok-4-6-vertex-ai|Aug 21, 2026|Product|blue|Grok 4.6 on Gemini Enterprise Agent Platform
grok-4-6-amazon-bedrock|Aug 19, 2026|Product|blue|Grok 4.6 on Amazon Bedrock
grok-build-for-everyone|Aug 19, 2026|Product|teal|Grok Build on web and mobile
grok-4-6-github-copilot|Aug 14, 2026|Product|blue|Grok 4.6 in GitHub Copilot
grok-4-6|Aug 12, 2026|Product|blue|Introducing Grok 4.6
introducing-grok-bot|Aug 11, 2026|Product|orange|Introducing Grok Bot
grok-imagine-image-2|Aug 7, 2026|Product|pink|Imagine Image 2.0
grok-imagine-video-1-5-references|Jul 31, 2026|Product|pink|Imagine Video 1.5 with References
grok-voice-think-fast-2|Jul 29, 2026|Product|teal|Introducing Grok Voice Think Fast 2.0
grok-build-mode|Jul 28, 2026|Product|teal|Introducing Build Mode
grok-github-copilot|Jul 28, 2026|Product|blue|Grok 4.5 in GitHub Copilot
introducing-google-workspace-addon|Jul 24, 2026|Product|blue|Grok in Google Workspace
workflows|Jul 23, 2026|Product|teal|Workflows in Grok Build
grok-4-5-everywhere|Jul 22, 2026|Product|blue|Bringing Grok 4.5 to iOS, Android, Web, and X
introducing-outlook-addin|Jul 21, 2026|Product|blue|Introducing Grok for Outlook
introducing-excel-addin|Jul 20, 2026|Product|blue|Introducing Grok for Excel
grok-4-5|Jul 16, 2026|Product|blue|Introducing Grok 4.5
grok-automations|Jul 16, 2026|Product|teal|Automations in Grok
grok-build-open-source|Jul 15, 2026|Product|teal|Grok Build is Now Open Source
new-flagship-voices|Jul 6, 2026|Product|teal|21 New Flagship Grok Voices
grok-voice-agent-builder|Jul 1, 2026|Product|teal|Introducing the Voice Agent Builder
introducing-goal|Jun 22, 2026|Product|teal|Introducing /goal
grok-databricks|Jun 18, 2026|Product|blue|Grok on Databricks
introducing-word-addin|Jun 18, 2026|Product|blue|Introducing Grok for Word
grok-amazon-bedrock|Jun 17, 2026|Product|blue|Grok on Amazon Bedrock
grok-imagine-video-1-5|Jun 16, 2026|Product|pink|Grok Imagine Video 1.5
introducing-powerpoint-addin|Jun 16, 2026|Product|blue|Introducing Grok for PowerPoint
agent-dashboard|Jun 15, 2026|Product|teal|Agent Dashboard in Grok Build
grok-warp|Jun 15, 2026|Product|teal|Use Grok in Warp
grok-plugin-marketplace|Jun 11, 2026|Product|teal|Grok Build Plugin Marketplace
grok-imagine-1-5|Jun 3, 2026|Product|pink|Grok Imagine 1.5 Preview
composer-2-5|Jun 1, 2026|Product|teal|Composer 2.5
grok-build-0-1|May 29, 2026|Product|teal|Grok Build 0.1 on API
grok-kilocode|May 27, 2026|Product|teal|Use Grok in Kilo Code
grok-build-cli|May 25, 2026|Product|teal|Introducing Grok Build
grok-opencode|May 21, 2026|Product|teal|Use Grok in OpenCode
grok-openclaw|May 19, 2026|Product|teal|Use Grok in OpenClaw
grok-skills|May 18, 2026|Product|teal|Skills in web, iOS, and Android
grok-hermes|May 15, 2026|Product|teal|Connect Grok to Hermes Agent
anthropic-compute-partnership|May 6, 2026|Company|blue|New Compute Partnership with Anthropic
grok-connectors|May 6, 2026|Product|blue|Connectors in web, iOS, and Android
grok-imagine-quality-mode|May 6, 2026|Product|pink|Grok Imagine Quality Mode API
grok-custom-voices|Apr 30, 2026|Product|teal|Custom Voices
grok-voice-think-fast-1|Apr 23, 2026|Product|teal|Grok Voice Think Fast 1.0
grok-stt-and-tts-apis|Apr 17, 2026|Product|teal|Grok Speech to Text and Text to Speech APIs
xai-joins-spacex|Feb 2, 2026|Company|violet|xAI joins SpaceX
grok-imagine-api|Jan 28, 2026|Product|pink|Grok Imagine API
series-e|Jan 6, 2026|Company|blue|xAI Raises $20B Series E
grok-business|Dec 30, 2025|Product|blue|Introducing Grok Business and Grok Enterprise
grok-collections-api|Dec 22, 2025|Product|blue|Grok Collections API
us-gov-dept-of-war|Dec 22, 2025|Company|blue|Supporting the DOW's mission with AI
grok-voice-agent-api|Dec 17, 2025|Product|teal|Grok Voice Agent API
el-salvador-partnership|Dec 11, 2025|Company|violet|xAI and El Salvador Pioneer the World's First Nationwide AI Education Program
grok-4-1-fast|Nov 19, 2025|Product|blue|Grok 4.1 Fast and Agent Tools API
grok-goes-global|Nov 19, 2025|Company|violet|Grok goes Global with KSA
grok-4-1|Nov 17, 2025|Product|blue|Grok 4.1
onegov|Sep 25, 2025|Company|blue|Expanding xAI for Government with GSA OneGov
grok-4-fast|Sep 19, 2025|Product|blue|Grok 4 Fast
grok-code-fast-1|Aug 28, 2025|Product|blue|Grok Code Fast 1
government|Jul 14, 2025|Company|blue|Announcing xAI for Government
grok-4|Jul 9, 2025|Product|blue|Grok 4
grok-3|Feb 19, 2025|Product|blue|Grok 3 Beta — The Age of Reasoning Agents
series-c|Dec 23, 2024|Company|blue|xAI raises $6B Series C
grok-1212|Dec 12, 2024|Product|blue|Bringing Grok to Everyone
grok-image-generation-release|Dec 9, 2024|Product|pink|Grok Image Generation Release
api|Nov 4, 2024|Product|teal|API Public Beta
grok-2|Aug 13, 2024|Product|blue|Grok-2 Beta Release
series-b|May 26, 2024|Company|blue|Series B funding round
grok-1.5v|Apr 12, 2024|Product|blue|Grok-1.5 Vision Preview
grok-1.5|Mar 28, 2024|Product|blue|Announcing Grok-1.5
grok-os|Mar 17, 2024|Research|violet|Open Release of Grok-1
prompt-ide|Nov 6, 2023|Product|teal|Announcing PromptIDE
grok|Nov 3, 2023|Company|blue|Announcing Grok`;

const featuredSummary =
  "SpaceXAI's most powerful model for coding and knowledge work. Twice as fast, at half the price of comparable models.";

export const xaiStories: XaiStory[] = entries.split("\n").map((line) => {
  const [slug, date, category, tone, title] = line.split("|");
  return {
    slug,
    date,
    category,
    tone: tone as XaiStory["tone"],
    title,
    ...(slug === "grok-4-7" ? { summary: featuredSummary } : {}),
  };
});

export const featuredStories = xaiStories.slice(0, 4);

export const findXaiStory = (slug: string) =>
  xaiStories.find((story) => story.slug === slug);
