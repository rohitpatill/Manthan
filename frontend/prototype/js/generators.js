// ============ Manthan — mock content generators (live runs) ============
(function () {
  // ---------- archetype detection ----------
  const ARCHES = [
    { key: 'economist', match: /econom|financ|market|invest|capital/i },
    { key: 'strategist', match: /strateg|military|compet|geopolit/i },
    { key: 'engineer', match: /engineer|architect|systems|technical|infra/i },
    { key: 'psychologist', match: /psycholog|behavio|organizat|people|culture/i },
    { key: 'ethicist', match: /ethic|moral|philosoph|legal|policy/i },
    { key: 'scientist', match: /scien|research|biolog|chem|physic|neuro|medic|clinic/i },
  ];
  function archetypeOf(expert) {
    const hay = (expert.title || '') + ' ' + (expert.name || '');
    const found = ARCHES.find((a) => a.match.test(hay));
    return found ? found.key : 'generic';
  }

  function topicOf(brief) {
    // first sentence of the SITUATION block, trimmed
    const sit = (brief.split(/CONSTRAINTS|THE QUESTION/i)[0] || brief).replace(/^SITUATION\s*/i, '');
    let s = sit.trim().split(/(?<=[.!?])\s/)[0] || sit.trim();
    if (s.length > 140) s = s.slice(0, 137).trimEnd() + '…';
    return s.replace(/\.$/, '');
  }

  // ---------- round-1 packs ----------
  const PACKS = {
    economist: {
      stance: (v) => v ? 'Proceed — but only with the downside case priced and capped in advance.'
                       : 'Hold — the expected value is being carried by optimistic assumptions.',
      paras: (t) => [
        `Strip the story out and price the decision. The situation — ${t} — has an upside everyone can narrate and a downside no one has quantified. My first demand is the downside case, computed honestly: what is lost if this goes wrong, and does the decision-maker survive that loss? Survival comes before expected value.`,
        `**The incentive read:** ask who benefits from each version of this decision and whether their enthusiasm is information or position-talking. Plans whose success requires more than two improbable things to happen at once should be treated as fiction with a budget.`,
        `**What I would do:** cap the commitment to a written budget and a deadline, define in advance the cheapest evidence that would justify the next increment — actual willingness to pay, not applause — and pre-commit to walking away if the evidence doesn't arrive. Optionality is worth paying for; unbounded commitment never is.`,
      ],
    },
    strategist: {
      stance: () => 'Act now but on narrow ground — hold what you have and open a small second front.',
      paras: (t) => [
        `Read the terrain before the plan. In this situation — ${t} — the first question is what ground is actually held: which advantages are real and defensible, and which are assumed. Most plans I reject fail here: they abandon strong ground to contest territory where the opposition is better supplied.`,
        `**Timing:** windows matter more than ambition. If the window is open, a small force moving now beats a large force moving next year. If it is closing, speed justifies risk — but only with a planned line of retreat. A bold move differs from an impulsive one precisely there.`,
        `**My recommendation:** secure the base first — the obligations and revenue that fund everything else. Then commit a small, autonomous unit to the new objective with a single clear mission and a fixed review date. Judge it on evidence at that date, reinforce success, and never let a temporary gap force a permanent commitment.`,
      ],
    },
    engineer: {
      stance: () => 'Feasible only in a reduced scope — find the load-bearing assumption and test it first.',
      paras: (t) => [
        `Treat this as a system to be built and operated, not an idea to be admired. For ${t}, the load-bearing assumption is whatever single component, dataset, integration, or person everything else silently depends on. Find it, name it, and stress-test it before committing the schedule to it.`,
        `**Separate hard from risky.** Hard means we know how and it takes time — that estimates fine. Risky means nobody knows if it works — that doesn't compress on demand, and it must be isolated so its failure doesn't take the whole plan down with it.`,
        `**The smallest version that works:** scope down to one capability, shipped to a handful of real users, on existing infrastructure, in weeks. Keep the technology boring and the scope narrow; expand only on evidence. If the small version can't be defined, that is the finding — the plan is a slogan, not a system.`,
      ],
    },
    psychologist: {
      stance: () => 'Workable — if the human layer is designed as deliberately as the plan itself.',
      paras: (t) => [
        `Strategies fail in the human layer long before they fail in the spreadsheet. For ${t}, ask first how each affected person will hear the decision as a story about themselves: whose skills are implied to be the past, whose status is compressed, who feels chosen and who feels left. Those reactions are predictable and therefore designable.`,
        `**Check the decision-maker too.** Pressure produces a need to act boldly; sunk cost dresses up as perseverance and novelty-seeking as vision. None of that makes the plan wrong — it makes the framing suspect, and framings, unlike markets, can be fixed for free.`,
        `**Concrete sequencing:** tell the most affected people first, privately. Announce with dates, names, and criteria rather than confidence theater — people trust specificity. Make any experimental track rotational with respectable re-entry, or the lesson everyone learns is that volunteering for the future is a career risk.`,
      ],
    },
    ethicist: {
      stance: () => 'Permissible with conditions — disclose, honor existing commitments, and write the kill criteria down.',
      paras: (t) => [
        `Name the obligations before the strategy. In this situation — ${t} — there are explicit commitments (contracts, promises, salaries) and implicit ones (people who made life decisions based on representations now being revised). Both bind. A plan that quietly invalidates them is not bold; it is unilateral.`,
        `**Who bears the downside?** Map each option to the people who absorb its failure, and notice whether they had a voice in the choice. Decisions that transfer risk from the people choosing to the people who didn't are the ones that need the strongest justification — and usually get the weakest.`,
        `**My conditions:** existing commitments honored or honestly renegotiated, not eroded by slippage; the people affected told the truth on a known date, not left to discover it; and the criteria for stopping written down in advance, signed, because intentions decay precisely when the demo gets exciting. Meet those and the plan passes; miss them and it doesn't.`,
      ],
    },
    scientist: {
      stance: () => 'Insufficient evidence for full commitment — restate as a testable hypothesis and run the cheap test.',
      paras: (t) => [
        `Restate the proposal as a hypothesis before anyone votes on it. For ${t}, what is actually known, what is assumed, and what is the base rate for plans of this class? Most of the confidence in the room is narrative, and narrative is not data.`,
        `**Design the cheapest falsifying test.** The right question is not "could this work" — almost anything could — but "what observation, obtainable in weeks, would tell us it won't?" Define the variables, fix the evaluation criteria before seeing results, and beware moving the goalposts after an exciting demo; that is how organizations fool themselves.`,
        `**My confidence levels:** that the underlying trend is real — moderately high. That this team's specific plan captures it on the proposed timeline — low, pending evidence. Recommendation: commit only to the experiment, pre-register its success criteria, and let the data — not the enthusiasm — authorize the next step.`,
      ],
    },
    generic: {
      stance: () => 'Proceed in stages — the direction is defensible, the proposed commitment level is not yet.',
      paras: (t) => [
        `My read of the situation — ${t} — is that the direction has merit but the case, as presented, blends what is known with what is hoped. The first task is to separate them explicitly, because every downstream choice depends on which column each claim sits in.`,
        `**The strongest argument for acting** is the cost of waiting: positions like this rarely stay open. The strongest argument against is concentration of risk — committing fully before the critical assumptions have been tested at small scale.`,
        `**My recommendation:** stage the commitment. Define the first increment narrowly, attach explicit evidence criteria and a review date to it, and protect existing obligations meanwhile. Scale only on demonstrated results. This preserves the upside the proposal is chasing while keeping the failure mode survivable.`,
      ],
    },
  };

  // ---------- round-2 ----------
  const R2 = {
    agree: (names) => `Reading the panel, the convergence is notable — ${names} arrive at compatible positions from different premises, which strengthens rather than dilutes the conclusion.`,
    packs: {
      economist: `My revision is narrow: I adopt the panel's implementation details where they make the bet cheaper to evidence, and I hold firm on the constraint everyone else treats as a footnote — the existing obligations are the binding limit, and no resources move until they are protected with named owners. I will also put a number on the decision point: if the agreed evidence has not arrived by the review date, the option expires. Variance kills; keep the bet small enough that being wrong is boring.`,
      strategist: `Hearing the others raises my confidence in the line of advance. I adopt the narrower implementation proposed by the panel as the correct tactical form of my recommendation, and I accept the firmer decision criteria — a better-defined trigger than my own. One push-back: disclosure is right, but timing belongs to leadership; announce the plan as a confident plan with dates and criteria, not as a confession. My recommendation stands: hold the base, open the second front now, judge it at the review date.`,
      engineer: `No one challenged the feasibility core, so I'll spend the revision making it concrete: explicit capacity math for existing commitments first, then the smallest team that can carry the new track — with planned rotation, adopting the panel's point. I add one technical gate to the commercial criteria: an agreed quality threshold on a frozen evaluation set before anything reaches a non-friendly audience. Shipping something confidently wrong would damage the trust that is the actual moat.`,
      psychologist: `The panel converged on the structure I argued for, so I'll focus on what everyone else treats as an afterthought: the announcement is part of the plan, not communication about it. Lead with what is *not* changing, name the experimental track openly including its kill criteria — which, counterintuitively, reduces anxiety because it signals adult supervision. And design failure as a respectable outcome with re-entry intact, or no strong person volunteers for the second rotation.`,
      ethicist: `The panel has converged on what I would call an honest structure, and I confirm my verdict with three conditions written down rather than remembered: the stopping criteria signed before work begins (the test of a kill criterion is whether it binds when the demo is exciting); a date by which everyone affected knows the plan; and explicit downside protection for the people taking the risk on the organization's behalf. Converged intentions decay under pressure — paper doesn't.`,
      scientist: `The debate sharpened the hypothesis without changing my epistemics: direction probable, specific plan unproven. I update on one point — the panel's implementation makes the experiment cheaper and faster to falsify than my original design, so I adopt it. I insist on pre-registration: evaluation criteria fixed in writing before results arrive, because the panel's growing consensus is exactly the condition under which goalpost-moving thrives. Enthusiastic agreement is not evidence.`,
      generic: `Having read the panel, I revise toward the emerging consensus on implementation while keeping my original caution on commitment level. The convergence across different analytical lenses is itself information — when independent framings agree, confidence is warranted. I fold the panel's sharper decision criteria into my recommendation and restate my one condition: the review date and its evidence bar must be fixed in advance, in writing, by people willing to be bound by them.`,
    },
  };

  // ---------- public API ----------
  function expertResponse(expert, brief, round, peers) {
    const arch = archetypeOf(expert);
    const t = topicOf(brief);
    if (round === 1) {
      const p = PACKS[arch] || PACKS.generic;
      return { stance: p.stance(true), text: p.paras(t).join('\n\n') };
    }
    const names = (peers || []).slice(0, 3).map((p) => p.name.split(' ').slice(-1)[0]).join(', ');
    const body = R2.packs[arch] || R2.packs.generic;
    const r2stances = {
      economist: 'Holding my caution; adopting the panel\'s cheaper implementation of the bet.',
      strategist: 'Position confirmed by the panel — narrow advance now, judged at the review date.',
      engineer: 'Plan unchanged and strengthened — adding capacity math and a quality gate.',
      psychologist: 'Endorsing the converged plan — with the announcement designed as a deliverable.',
      ethicist: 'Verdict holds — the converged plan passes, if the pre-commitments are written down.',
      scientist: 'Direction probable, plan still unproven — adopting the panel\'s cheaper experiment.',
      generic: 'Revising toward the consensus implementation; keeping my condition on commitment level.',
    };
    return { stance: r2stances[arch] || r2stances.generic, text: R2.agree(names) + '\n\n' + body };
  }

  function synthesisText(experts, answers, round, missingNames) {
    const last = (e) => e.name.split(' ').slice(-1)[0];
    const names = experts.map(last);
    const lines = experts.map((e) => `*${last(e)}:* ${answers[e.id].stance}`).join('\n');
    const missing = missingNames && missingNames.length
      ? `\n\n**Note:** ${missingNames.join(', ')} did not complete this round (call failed); this synthesis weighs only the responses received.` : '';
    if (round === 1) {
      return `**Where the council stands (Round 1):**\n${lines}\n\n**Key agreements.** The panel aligns on three points: existing obligations are the binding constraint and must be protected before anything moves; the underlying direction is treated as plausible by every lens, including the skeptical ones; and any new commitment should be staged — small, time-boxed, and judged on pre-agreed evidence rather than enthusiasm.\n\n**Key conflicts.** The live disagreements are about commitment level and disclosure, not direction. ${names[0] || 'The first expert'} would cap the bet hardest; ${names[1] || 'others'} would aim it more aggressively at the open window. On disclosure, the panel splits between transparency as a moral requirement and transparency as attrition control — same prescription, different reasons, but the timing question is unresolved.\n\n**Weighing.** The downside arguments are the strongest on the table: no expert produced an upside case that requires full commitment now to capture. That asymmetry should decide the default.\n\n**Recommendation.** Stage the commitment: protect existing obligations with named capacity, open a small, evidence-gated track toward the new direction, and fix the review date and its criteria in writing before work begins.${missing}`;
    }
    return `**Final verdict — the council converged.**\n${lines}\n\nAfter the debate round, the panel endorses a single structure with confidence increased rather than diluted — and convergence across ${experts.length} independent lenses is itself evidence.\n\n**The plan.** (1) Existing obligations first, with named owners and explicit capacity. (2) A small, autonomous track toward the new direction — staffed by volunteers with planned rotation and respectable re-entry. (3) A fixed review date with criteria written and signed in advance: commercial evidence (willingness to pay, not applause) plus a quality gate on a frozen evaluation set. (4) Full disclosure to everyone affected by a set date — specific, confident, criteria stated openly.\n\n**Resolved conflicts.** Disclosure timing resolved as "sequenced but dated" — leadership controls the order, not the existence, of the announcement. Commitment level resolved by merging the hardest cap with the sharpest aim: small force, narrow ground, hard deadline.\n\n**Conditions that would reopen the decision:** failure of a protected obligation, loss of a critical person, or the review-date test failing — in which case the track dissolves with re-entry intact — or passing, in which case expansion proceeds on evidence.${missing}`;
  }

  // ---------- intake ----------
  function intakeReply(userMsgs) {
    const text = userMsgs[userMsgs.length - 1] || '';
    const total = userMsgs.join(' ');
    if (userMsgs.length === 1 && text.trim().length < 60) {
      return {
        ready: false,
        text: "Welcome. I'm Manthan AI — I prepare your problem before it reaches the council, so the experts get one sharp brief instead of a vague prompt.\n\nTell me about the decision or problem you're facing: the situation, what's at stake, and what kind of advice you want from the panel.",
      };
    }
    if (userMsgs.length === 1 || total.length < 220) {
      return {
        ready: false,
        text: "Useful start. Before I brief the council, help me pin down what actually binds:\n\n1. **Constraints** — time, money, commitments already made, anything non-negotiable?\n2. **Options on the table** — what courses of action are you actually deciding between?\n3. **What a good answer looks like** — a verdict, a plan, a risk assessment?",
      };
    }
    const situation = userMsgs.map((m) => m.trim()).join('\n\n');
    const brief = `SITUATION\n${situation}\n\nCONSTRAINTS\nAs stated above — the council should treat any commitments, deadlines, and resource limits mentioned as binding.\n\nTHE QUESTION FOR THE COUNCIL\nRecommend a specific course of action. State your position in one line, then your reasoning. Name the conditions under which your recommendation would change.`;
    return {
      ready: true, brief,
      text: "I have a complete enough picture — situation, constraints, and the decision to be made. I've compiled the brief: every expert will receive exactly this text, independently and blind to the others.\n\nReview it below and edit anything I got wrong. When you confirm, the council convenes.",
    };
  }

  // ---------- persona builder ----------
  const BUILDER_PACKS = [
    { match: /econom|macro|financ|market/i, name: 'Viktor Lindqvist', title: 'Macro-economist — cycles, incentives & capital flows', provider: 'gemini', model: 'gemini-3.1-pro-preview',
      persona: `Viktor spent fifteen years in sovereign risk and asset allocation before turning advisor. He reads every problem through incentives and flows: who is paid to believe what, where the capital is moving, and what the market has already priced that the room has not.\n\nHe is contrarian by training rather than temperament — he distrusts consensus precisely when it is most comfortable, and he prices the downside case before entertaining the upside. He thinks in distributions, not points.\n\nOn a panel he provides the cold-water assessment: quantified wherever possible, blunt where it matters, always ending with the trade he would actually make.` },
    { match: /skeptic|critic|devil|contrarian/i, name: 'Dr. Ruth Calloway', title: "Professional skeptic — devil's advocate & failure modes", provider: 'anthropic', model: 'claude-opus-4.7',
      persona: `Ruth made her name doing pre-mortems for organizations about to make large irreversible decisions. Her role is structured opposition: she assumes the plan has failed three years from now and reasons backward to the most plausible causes.\n\nShe is not a pessimist — she is a specialist in the gap between how decisions look from inside (exciting, inevitable) and from outside (base rates, survivorship bias). She attacks the strongest version of the plan, never the weakest.\n\nShe delivers her findings as ranked failure modes with early-warning signs for each, and she always names the one argument that would make her switch sides.` },
    { match: /neuro|medic|clinic|health|doctor|bio/i, name: 'Dr. Meera Iyer', title: 'Neurologist — clinical decision-making under uncertainty', provider: 'openai', model: 'gpt-5.5',
      persona: `Meera is a practicing neurologist who has spent two decades making consequential decisions with incomplete information. Clinical practice taught her a discipline most fields lack: explicit differential diagnosis, base rates over anecdotes, and treating every intervention as having side effects.\n\nShe reasons in differentials — listing the plausible explanations ranked by likelihood, then asking which cheap test best discriminates between them. She is acutely aware of iatrogenic risk: the harm caused by the intervention itself.\n\nOn a panel she translates that discipline to any domain: what are we treating, what is the evidence it is the actual condition, and is the cure's risk profile better than the disease's.` },
    { match: /law|legal|regulat|complian/i, name: 'Amara Osei', title: 'Regulatory counsel — law, liability & exposure', provider: 'openai', model: 'gpt-5.5',
      persona: `Amara spent a decade in regulatory enforcement and another advising companies on the receiving end. She reads every plan for exposure: what is being promised, to whom, and what happens when a regulator, court, or counterparty reads the same document with hostile eyes.\n\nShe distinguishes sharply between what is illegal, what is enforceable, and what is merely customary — three categories most decision-makers blur. She is pragmatic: her job is to make the plan survivable, not to kill it.\n\nHer advice always lands as exposure ranked by severity × likelihood, with the cheapest mitigation for each, and a clear line marking what she would refuse to sign.` },
    { match: /design|product|ux|user/i, name: 'Tomás Aguilar', title: 'Product designer — users, adoption & the gap between plan and behavior', provider: 'anthropic', model: 'claude-sonnet-4.6',
      persona: `Tomás has designed products used by millions and killed by committees. His lens: every strategy eventually has to be operated by a real person on a bad day, and most plans fail at that exact interface.\n\nHe asks what the user actually does today, what the switching cost feels like from inside their routine, and what the plan assumes about human behavior that has never been observed in the wild. He prototypes arguments the way he prototypes screens — cheap, fast, disposable.\n\nOn a panel he is the advocate for observed behavior over stated preference, and he will always propose the smallest real-world test that would settle the room's biggest disagreement.` },
  ];
  function builderDraft(description) {
    const found = BUILDER_PACKS.find((p) => p.match.test(description));
    if (found) { const { match, ...rest } = found; return rest; }
    // generic: derive a title from the description
    let d = description.trim().replace(/^i\s+(need|want)\s+(an?\s+)?/i, '').replace(/\.$/, '');
    if (d.length > 60) d = d.slice(0, 57) + '…';
    const titled = d.charAt(0).toUpperCase() + d.slice(1);
    return {
      name: 'Jordan Whitfield',
      title: titled.length > 4 ? titled : 'Independent advisor',
      provider: 'anthropic', model: 'claude-sonnet-4.6',
      persona: `Jordan is a senior advisor whose brief matches what you described: ${description.trim()}\n\nThey reason from first principles within that lens — separating what is known from what is assumed, weighing the strongest version of each side, and being explicit about confidence levels rather than performing certainty.\n\nOn a panel they commit to a clear position with stated conditions for changing it, and they flag where their lens is likely to be blind so the rest of the council can cover it.`,
    };
  }
  function builderReply(description, draft) {
    return `Here's the expert I'd convene for that. I've drafted the full persona — who they are, how they reason, and the model I'd assign (${draft.model} suits this kind of thinking).\n\nReview the draft on the right: edit any field, swap the model, and save them to your council. You can add an avatar now or later.`;
  }

  window.Gen = { expertResponse, synthesisText, intakeReply, builderDraft, builderReply, archetypeOf };
})();
