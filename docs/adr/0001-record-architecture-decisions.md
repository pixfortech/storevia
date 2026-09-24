# ADR-0001: Record architecture decisions

- Status: Accepted
- Date: 2026-09-24

## Context

Storevia is intended to be a long-lived commercial platform built by many
contributors (human and AI). Decisions about tenancy, billing, data formats
and security must survive staff changes and be revisited deliberately, not
accidentally.

## Decision

Record every significant architectural decision as a numbered Markdown ADR in
`docs/adr/`, using the format: Status, Date, Context, Decision, Consequences,
Alternatives considered. ADRs are immutable once accepted. A change of
direction is a new ADR that supersedes the old one (and the old one's status is
updated to "Superseded by ADR-XXXX").

A change needs an ADR when it affects tenancy, security, data formats, public
contracts (API, webhooks, page documents, theme packages), core dependencies,
or infrastructure.

## Consequences

- Reviewers can check changes against recorded decisions.
- A small, ongoing writing cost for each significant decision.
