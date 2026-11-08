# Retrieved XGA working draft

Retrieved 2026-10-29 from conversation 6ae2760d-3b38-83e8-8a4e-cca60d83516c, message dd45ca57-0822-4a34-8c22-87c7d3705d7e.
This is a historical design source, not the current implementation specification.
Some rich diagrams or interactive elements are absent from the retrieved text.

This is an important tangent for XEI because **governance and policy are what make an evolving infrastructure trustworthy, especially when both human and AI agents can contribute to its evolution.**

We have already established that XEI — *Experiential Evolving Infrastructure* — should continuously improve through agent participation, usage data, feedback, and evaluation.

But that raises several questions\:

Who decides what should change? Can an AI agent modify a component without approval? What happens when two agents disagree? Can a policy itself evolve? Who has the authority to approve that evolution?

These are governance questions.

## 1\. What exactly are governance and policy?

The simplest distinction is\:

**Governance determines how decisions are made and who has authority. Policy determines the rules those decisions and actions must follow.**

They are related, but not interchangeable.

## Governance

The decision-making system

Defines authority, accountability, approval, oversight, conflict resolution, and how rules themselves change.

## Policy

The governing rules

Defines what is required, permitted, prohibited, or conditional when agents interact with the system.

---

EXAMPLE WITHIN XEI

**Governance\:** The XEI maintainers authorize changes to foundational design tokens.

**Policy\:** An AI agent may propose changes to foundational tokens, but cannot publish them without authorized approval.

There's a third concept worth distinguishing: **procedure**\.

A policy might say that a breaking change needs approval. A procedure explains exactly how to submit the change, run tests, collect reviews, and publish it.

Think of them as\:

- **Governance\:** Who decides, and how is authority exercised?
- **Policy\:** What rules must be followed?
- **Procedure\:** How are those rules carried out?

## 2\. Will XEI have different types of policies?

Yes. I recommend a policy architecture rather than one enormous collection of rules.

Initially, I would distinguish eight policy domains.

| Policy domain | What it governs |
|--------|--------|
| Identity &amp; Naming | IDs, naming grammar, uniqueness, renaming |
| Entity &amp; Schema | Required fields, types, contracts, validation |
| Agent &amp; Authority | Who may observe, propose, modify, approve, or publish |
| Design &amp; Experience | Accessibility, consistency, interaction quality |
| Evolution &amp; Change | Proposals, experiments, reviews, migrations |
| Release &amp; Compatibility | Versions, generations, deprecation, compatibility |
| Security &amp; Data | Permissions, privacy, data use, protection |
| Evaluation &amp; Evidence | Metrics, testing criteria, evidence quality |

These are policy *domains*, not necessarily eight policy documents. Each domain can eventually contain multiple specific policies.

For example, the Identity &amp; Naming domain might include a canonical identifier policy, a reserved namespace policy, and an identifier deprecation policy.

## 3\. How the pieces work together

## XEI Governance

Authority · Accountability · Decision rights

Policy Architecture

Illustrative subset of the policy domains

**Contracts &amp; Procedures**

Entity requirements · Workflows · Validation

**Agent Actions &amp; System Changes**

Propose · Evaluate · Authorize · Execute · Audit

This is a conceptual hierarchy. In practice, contracts and policies work together: a contract defines the obligations of an entity, while policies determine who can change it and under what conditions.

## 4\. Not every policy has the same authority

I recommend introducing three levels of policy scope.

**Level 1 — No Origins policies** (Organization-wide)

Apply to everything created under No Origins, including XEI and individual products.

Example: All registered entities must have a traceable, accountable owner.

**Level 2 — XEI policies**

Apply to the infrastructure and its governed entities.

Example: Published canonical identifiers must not be reassigned to different entities.

**Level 3 — Entity-specific policies**

Apply to particular agents, components, systems, or other entities.

Example: Changes to the primary typography token require accessibility validation.

The default principle should be **policy inheritance**\: an entity inherits applicable policies from its governing scope, and more specific policies may add restrictions without silently overriding higher-level rules.

For example, a product could require two approvals where XEI requires one, but it shouldn't be able to remove a mandatory No Origins security control.

We should later formalize policy precedence, conflicts, and explicitly authorized exceptions.

## 5\. How would policy enforcement actually work?

Imagine an AI design agent discovers that a button's contrast is insufficient and proposes an improvement.

**Example: AI agent policy evaluation** (Illustrative)

AI agent wants to...

---

This demonstrates a proposed authorization model, not a live XEI enforcement engine.

For actual enforcement, XEI would need to evaluate several things together: the agent's identity, its assigned role, the entity being changed, the requested action, applicable policies, and the context of the request.

The resulting decision might be `allow`, `deny`, or `requires_approval`, accompanied by an explanation and an audit record.

## 6\. Policies themselves must evolve

This is particularly relevant to XEI.

If agents continuously improve XEI, they should also be able to identify weaknesses in its policies. But **the authority to propose a policy change should be separate from the authority to approve and activate it.**

I'd introduce a policy lifecycle\:

Example policy lifecycle (Proposed)

1. **Draft** — Human or AI agent proposes a rule.
2. **Evaluate** — Assess impact, conflicts, evidence, and risks.
3. **Approve** — An authorized decision-maker accepts the policy.
4. **Activate** — The approved policy becomes enforceable.
5. **Monitor** — Measure effectiveness and unintended consequences.
6. **Revise or retire** — Create a new version or formally withdraw it.

For example, imagine an accessibility policy starts with a minimum contrast requirement and later needs revision because new interaction contexts emerge.

Rather than silently modifying the existing rule, XEI should preserve its history: which agent proposed the change, why it was needed, who approved it, and when it took effect.

That makes governance auditable and allows the system to learn from previous decisions.

## 7\. How governance fits into our Entity Core Contract

Earlier, we established this structure\:

```yaml
governance:
  owner: no
  policy: governed
```

I now think we should refine it.

The value `governed` doesn't tell an agent enough to know what it may actually do.

Instead, I propose\:

```yaml
governance:
  owner: no
  policy_refs:
    - no.policy.identity
    - no.xei.policy.evolution
  authority:
    approval_role: xei-maintainer
```

These identifiers are illustrative; the policy records and roles haven't been formally created.

Notice that the entity contract doesn't duplicate all the policy rules. It **references policies maintained elsewhere**\.

This is an important architectural decision. If a policy changes, we shouldn't need to rewrite thousands of entity contracts.

For reliable reproducibility, an evaluation should also record the exact policy revisions applied at decision time.

---

## 8\. The governance principle I'd establish for XEI

PROPOSED FOUNDATION · GOVERNANCE 001

## Governed Evolution

Every agent may contribute to the evolution of XEI within its granted capabilities, but changes must be evaluated, authorized, and traceable according to applicable policies.

My recommendation is to make XEI governance **distributed in contribution but accountable in authority**\.

Human and AI agents can observe, identify issues, experiment, and propose improvements. Approval and execution rights should depend on the risk and scope of a change. Low-risk changes can eventually be automated, while foundational architectural and high-impact policy changes require stronger oversight.

One distinction matters especially: **governance doesn't mean every change requires human approval**\. It means every change follows a defined authority model, which may authorize automation within clear limits.

### Where this leaves our architecture

We now have two connected foundations\:

- **XEC — Entity Core Contract\:** Defines what an entity is and what it must declare.
- **XEI Governance Architecture\:** Defines how that entity and its applicable policies can be created, accessed, changed, approved, and retired.

I would keep the detailed Policy Architecture as a separate specification, rather than trying to put everything into XEC-001.

And when we return to the seven-type Entity Registry, we'll have an interesting decision to make: **whether a policy is a specialized kind of `rule`, or whether `policy` deserves to be its own entity type.**

My initial recommendation is to model policies as governed rule sets with their own identities, versions, scope, and authority. We can evaluate whether that requires a distinct entity type when we formalize the registry.

