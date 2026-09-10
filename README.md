# Crohnoz Fresh Market

[![CI](https://github.com/Crohnoz/Crohnoz-FreshMarket/actions/workflows/ci.yml/badge.svg)](https://github.com/Crohnoz/Crohnoz-FreshMarket/actions/workflows/ci.yml)

**L1 · Prototype / R&D**

Crohnoz Fresh Market is an early product exploration for small fresh-food retailers. The project is being used to model inventory, receiving, orders, preparation, waste and day-to-day operational workflows before treating the product as a commercial pilot.

## Why it exists

Small produce and fresh-food businesses often operate across notebooks, WhatsApp, memory and disconnected spreadsheets. Fresh Market explores how those workflows can be represented as explicit system state without making the operator's job harder.

The current goal is **learning and domain validation**, not a production claim.

## Current prototype surface

The repository contains experiments around:

- product and catalog management;
- inventory lots and receiving;
- FEFO-oriented stock handling;
- order preparation and operational states;
- waste and adjustments;
- daily operational views;
- local continuity and backup concepts;
- a Django / DRF backend boundary for selected remote workflows.

Some flows run locally in the browser and selected backend flows are under active development. These surfaces should not be interpreted as a complete synchronized production system.

## Engineering questions being explored

Fresh Market is currently useful as an R&D vehicle for questions such as:

- How should perishable stock be modeled?
- Which actions need idempotency and optimistic concurrency?
- How should an operator distinguish local state from server-backed state?
- What information is essential during receiving, preparation and waste handling?
- How can continuity be maintained when connectivity is unreliable?

## Technology

Current experiments include:

- Django / Django REST Framework
- PostgreSQL-ready backend configuration
- HTML / CSS / JavaScript operational surfaces
- Docker
- automated checks and tests

The architecture is intentionally still evolving while the operational model is validated.

## Current limits

Fresh Market is **not presented as production software**. In particular:

- the complete operational workflow is not yet server-backed;
- offline synchronization is not complete;
- deployment and long-running production behavior are not yet proven;
- real-user validation is still required before advancing the maturity level;
- security and operational controls must continue to be hardened as backend scope expands.

## Maturity model

`L0 IDEA → ● L1 PROTOTYPE → L2 PILOT → L3 PRODUCTION → L4 SCALE`

The maturity label will move only when evidence supports it.

## Crohnoz Labs

Fresh Market is part of the Crohnoz Labs product-engineering portfolio.

**Problem → System → Evidence → Scale**

- Crohnoz profile and public evidence: https://github.com/Crohnoz
- Crohnoz Labs: https://crohnozlabs.cl
