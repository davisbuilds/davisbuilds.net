---
# imported from vault note "Projects/Writing/Working With Agents.md"; edit it there and re-run scripts/import-essay.mjs
title: "Working With Agents"
description: "Lessons from building over the past year"
created: 2026-08-16
updated: 2026-10-09
published: 2026-10-09
status: "finished"
confidence: "likely"
importance: 8
tags: ["agents"]
written_by: "Davis"
also_on: "https://davisbuilds.substack.com/p/working-with-agents"
---
After writing maybe 1000 lines of code in my pre-coding agents era, I successfully trained my first CNN with help from Claude (3.7 Sonnet) in March of 2025 and haven't looked back since. My GitHub activity tells a similar story: 21 contributions in 2024, 248 in 2025, and nearly 6000 so far in 2026.

Over this period I have learned (and unlearned) many things -- I read all the blog posts, tuned into Dwarkesh podcasts, and turned on notifications for Andrej Karpathy's X account. Tried staying on top of the firehose of news and model releases. But ultimately, my biggest learnings have come from just using the models every day. Noticing the unlocks as they get smarter. And trying (with less and less success) to find tasks that they still cannot do.

If for nothing else but a snapshot of my own understanding, I've found writing down my working patterns with agents to be a useful exercise in crystallizing the capabilities as I understand them today while prompting me to think about what potential futures might look like. I had to update considerably with the releases of Claude Fable 5 and GPT-6 Astra, and I expect this to continue for the foreseeable future.

I used to think I was handicapped because I didn't know a JavaScript framework or bash, but I've come to see this as an advantage today. Maybe this is just cope, but because I'm not a conventional "programmer", I can be fluid and just try things. I'm not tied down to a school of thought or way of life. I've evolved with the tools.

With that said, here are some of my learnings from building with agents over the past year or so. I think some of these will be relevant in the next year; some won't, and that's okay.

## What's worked

1. **Curate context.** Each new session starts fresh. Models repeat the same mistakes if they don't have something telling them not to. Claude doesn't know something Codex saved to memory and vice versa (I built [engram, a shared memory tool](https://github.com/davisbuilds/engram), to bridge the gap here). The most important file in each of my repos is my `AGENTS.md`. I keep this doc concise, conditional, and extremely high-signal, without too many instructions that end up overconstraining the agent. The goal here is to ground agents effectively, route efficiently, and keep behavior predictable. Here's an [example](https://github.com/davisbuilds/dojo/blob/main/AGENTS.md).
2. **Codify repetition.** Once I find myself typing the same thing more than a few times, I write it somewhere durable I can point future agents to -- whether it be a one-liner in my `AGENTS.md`, a generalizable `SKILL.md`, or a conditionally loaded capability or guide, this has saved me a lot of time and execution ambiguity.
3. **Red/green TDD.** [Explained here](https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/) by Simon Willison, having agents write tests that fail first and iterate against them until they pass is a very effective fit for the current paradigm. I call out test driven development (TDD) as a first-class working agreement in my `AGENTS.md`. Just make sure agents write the failing test for the right reason -- it shouldn't be failing just because something doesn't exist yet.
4. **@codex for code review.** Frontier models still make *lots* of mistakes! I've found telling my agents to comment "@codex" on PRs to be especially helpful -- most reviews come back with at least one real finding, with about 40% being a high-priority fix. Claude also has a similar CI workflow that can be enabled but I've found it chews through many more tokens.
5. **Give agents more permissions.** Over time I've graduated from accepting edits to running agents with full permissions and simply reviewing at PR time (@codex), greatly speeding up the development loop. This obviously comes with more risk, so you should have the right guardrails in place and understand the tasking / output enough to feel comfortable. Both Claude Code and Codex have recently converged around a more permissive "auto mode."
6. **Play ping pong with your agents.** Especially when drafting specs/plans/proposals, ask a fresh agent to critique the other's work -- launch a subagent, paste in a new session, etc. I consistently find the original agent skimping or missing out on key details the other catches.
7. **Leverage deterministic tools.** Where they make sense, don't waste tokens trying to get a stochastic agent to solve linting for you (use `ruff`) or CI best practices (use `zizmor`). Agents will gladly build one-offs instead of leverage existing tools if you don't tell them.
8. **Build verification infrastructure.** Providing the ability to easily test the functionality and performance of the features agents build is a big unlock -- whether that be a custom CLI they can leverage, dev environment they drive, or end-to-end framework like Playwright for browser testing. Checks need to prove they catch real problems though, otherwise there's no difference between a clean result and a check that isn't actually measuring anything.
9. **Design for capable agents.** Related to my first point, AI today is extremely smart. Give it room to reason through approaches, don't force overly strict instructions or complex workflows; "vanilla" setups are surprisingly effective! As agents' native capabilities and intelligence continue to improve, less and less will be required from the harnesses around them.

## What hasn't
1. **Sacrificing understanding for speed.** It's extremely tempting to just have your agent keep pushing out features, but there will come a point in time where you realize your project has become a house of cards with overlooked assumptions and decisions you didn't make nor fully understand. You can outsource execution, but you should never outsource understanding.
2. **Doing too many things at once.** Trying to fix a bug while also refactoring the UI and improving performance on top of it in one session generally doesn't lead to the best results, although this has gotten better with improvements to subagents. I try to keep a session scoped to a specific task, especially with less capable models like Sonnet/Terra/Luna.
3. **Mandating workflow artifacts.** I used to have agents write `.md` files for everything -- brainstorming sessions, specs, plans, verification evidence. This left me with two recurring problems: 1) maintenance obligation, and 2) drift over time. I still haven't solved this fully, but my skills require artifacts much less, so I read less markdown nowadays and haven't noticed any regressions as a result.
4. **Letting agents organize without fixed structure.** Without predefined naming standards or vocabulary, agents will happily create variants of the same file or tag -- after I had them go through my Obsidian vault, I found half the tags they created were only used once.
5. **Assuming equivalence between harnesses.** While both are amazing products with incredible underlying models, Claude Code and Codex work differently, and so overfitting to one can underfit the other. Try to find goldilocks solutions that work for both.
