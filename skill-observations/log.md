# Skill Observation Log

Observations captured during task-oriented work. Each entry identifies a potential skill improvement or new skill opportunity.

**Status key:** OPEN = not yet actioned | ACTIONED = skill updated/created | DECLINED = user decided not to pursue

---

## 2026-08-06 — Painel financeiro Next.js

### Observation 1: Detect active dev servers before production builds

**Date:** 2026-08-06
**Session context:** Implementing and validating a Next.js dashboard while an older `next dev` process for the same checkout remained active.
**Skill:** build-web-apps:frontend-testing-debugging
**Type:** open-source
**Phase/Area:** Local server and build validation

**Issue:** A production build initially passed, then a later verification failed because stale files under `.next/dev/types` were truncated while the active development server and `next build` shared the same output directory. The build error pointed at generated route declarations rather than application code, which could easily lead to unnecessary source changes.

**Suggested improvement:** In the skill's local-server preflight, detect listeners and active Next.js processes for the target checkout before running `next build`. If a dev server shares the checkout, either obtain permission to stop it, build in an isolated worktree/output directory, or verify generated `.next/dev/types` files before interpreting their type errors as source failures.

**Principle:** Before trusting generated-code failures, verify that concurrent processes are not mutating the same build artifacts; isolate writers or coordinate their lifecycle during production validation.

### Observation 2: Collapse clarification gates when the user requests autonomy

**Status:** OPEN
**Date:** 2026-08-07
**Session context:** Designing and implementing a stock dashboard with audit logging in an existing business system.
**Skill:** brainstorming
**Type:** open-source
**Phase/Area:** Clarifying questions and user approval gates

**Issue:** The workflow asked several one-at-a-time clarification questions after the project structure already supported a safe recommended design. The user explicitly responded that the agent should stop asking about every detail and proceed. The strict incremental gate increased friction even though the remaining decisions could be handled through reversible, documented assumptions.

**Suggested improvement:** Add an adaptive-autonomy rule to the Clarifying Questions and User Review Gate sections: when a user explicitly asks the agent to proceed without further questions or signals frustration with repeated gates, consolidate remaining low-risk assumptions into one concise design statement, treat the instruction as authorization to continue, and ask again only for decisions that materially change scope or external state.

**Principle:** Approval workflows should preserve safety without turning reversible design choices into repeated interruptions; explicit requests for autonomy should collapse nonessential gates while retaining escalation for irreversible or materially divergent decisions.

