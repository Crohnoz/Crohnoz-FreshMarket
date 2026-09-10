<div align="center">

<img src="https://raw.githubusercontent.com/Crohnoz/Crohnoz/main/brand/assets/logo-horizontal-dark.svg" alt="Crohnoz Labs" width="340" />

# Crohnoz Fresh Market

### `L1 · Prototype / R&D`

**Fresh-retail operations modeled around perishable inventory, receiving, preparation, waste and continuity.**

[![CI](https://github.com/Crohnoz/Crohnoz-FreshMarket/actions/workflows/ci.yml/badge.svg)](https://github.com/Crohnoz/Crohnoz-FreshMarket/actions/workflows/ci.yml)

<a href="https://github.com/Crohnoz/Crohnoz/blob/main/evidence/fresh-market.md"><img src="https://img.shields.io/badge/READ-ENGINEERING_CASE-06B6D4?style=for-the-badge" height="34" alt="Read engineering case" /></a>
<a href="https://github.com/Crohnoz"><img src="https://img.shields.io/badge/RETURN-PROFESSIONAL_PROFILE-8B5CF6?style=for-the-badge" height="34" alt="Professional profile" /></a>

**Inventory → Receiving → Orders → Preparation → Waste → Traceability**

</div>

---

## Product role

Crohnoz Fresh Market is an early-stage product exploration for small fresh-food retailers. It is being used to understand and model the operational rules behind **perishable stock, receiving, order preparation, adjustments, waste and continuity** before treating the product as a commercial pilot.

The current objective is **domain learning and engineering validation**, not production positioning.

---

## Why this problem is different from generic retail CRUD

Fresh-product operations depend on time, lot condition, receiving context and operator decisions. A useful system therefore needs to represent more than a product table and a stock counter.

The R&D work focuses on questions such as:

- which lot should be consumed first and why;
- how receiving creates traceable stock state;
- what happens when the same operation is retried;
- how local and server-backed state should be distinguished;
- how preparation and waste affect inventory truth;
- how the operation continues when connectivity is unreliable.

---

## What it demonstrates today

| Capability | Current prototype signal |
|---|---|
| **Perishable inventory** | Lot-oriented inventory and FEFO reasoning |
| **Receiving** | Incoming stock modeled as an operational event rather than a blind quantity edit |
| **Order workflow** | Preparation and operational states are explicit concepts |
| **Traceability** | Waste and adjustments are treated as accountable inventory movements |
| **Backend boundary** | Django / DRF is used for selected server-backed workflows |
| **Reliability questions** | Idempotency, optimistic concurrency and local continuity are part of the design work |

Some flows run locally in the browser while selected backend flows remain under active development. The current repository should **not** be interpreted as a complete synchronized production platform.

---

## Architecture direction

The prototype deliberately separates three concerns:

`Operator workflow → Domain rules → Persistence / synchronization boundary`

This keeps the research focused on the operational contract before prematurely locking the product into a large infrastructure design.

Current experiments include:

- Django / Django REST Framework;
- PostgreSQL-ready backend configuration;
- HTML / CSS / JavaScript operational surfaces;
- Docker-based delivery experiments;
- automated checks and tests.

---

## Engineering questions under validation

### Inventory integrity
How should lots, receiving, consumption priority, waste and adjustments interact without producing invisible stock drift?

### Concurrency
Which operations require idempotency or optimistic concurrency once multiple clients interact with server state?

### Continuity
Which actions must remain possible locally when connectivity is poor, and how should that local state later reconcile safely?

### Operator UX
What is the minimum information needed at receiving, preparation and waste time without turning the interface into an administrative burden?

---

## Current boundaries

Fresh Market is **not production software today**.

The complete workflow is not yet server-backed, offline synchronization is incomplete, long-running deployment behavior is not proven, and real-user validation is still required. Security and operational controls must continue to harden as backend scope expands.

These limitations are intentional public context—not hidden roadmap debt.

---

## Current maturity

<div align="center">

### `L0 IDEA → ● L1 PROTOTYPE → L2 PILOT → L3 PRODUCTION → L4 SCALE`

</div>

Advancing to `L2` requires evidence from real operational use: repeated workflows, validated domain behavior, stable data boundaries and enough continuity evidence to call the system a pilot rather than a prototype.

---

<details>
<summary><strong>Engineering stack</strong></summary>

<br/>

`Django` · `Django REST Framework` · `PostgreSQL-ready configuration` · `HTML / CSS / JavaScript` · `Docker` · `Automated checks`

</details>

---

<div align="center">

### Crohnoz Labs

**Technology that solves real operational problems.**

<a href="https://github.com/Crohnoz/Crohnoz/blob/main/evidence/fresh-market.md"><img src="https://img.shields.io/badge/REVIEW-CURATED_CASE-06B6D4?style=for-the-badge" height="34" alt="Review curated case" /></a>
<a href="https://crohnozlabs.cl"><img src="https://img.shields.io/badge/ENTER-CROHNOZ_LABS-EC4899?style=for-the-badge" height="34" alt="Crohnoz Labs" /></a>

**Problem → System → Evidence → Scale**

</div>
