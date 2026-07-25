---
articleId: en-math-equivalence-relations
locale: en
title: Equivalence Relations and Quotient Sets
slug: equivalence-relations
subject: mathematics
category: set-theory
concepts:
  - id: math.set-theory.equivalence-relations
    anchor: definition
authors: [atlas-math-team]
reviewers: []
status: published
createdAt: 2025-06-12
updatedAt: 2026-07-01
summary: Defines equivalence relations, equivalence classes and quotient sets.
difficulty: basic
estimatedMinutes: 20
tags: [relations, foundations]
---

## Definition {#definition}

An **equivalence relation** on a set $A$ is a binary relation that is reflexive, symmetric and transitive.

A standard example is congruence modulo $n$ on the integers: $a \equiv b \pmod n$ iff $n$ divides $a - b$.

## Equivalence classes

For an equivalence relation $\sim$, the **equivalence class** of $a$ is

$$[a] = \{x \in A \mid x \sim a\}.$$

Two equivalence classes are either equal or disjoint, so the classes partition $A$.

## Quotient sets

The set of all equivalence classes, written $A/{\sim}$, is called the **quotient set**. Passing from elements to classes is the basic construction behind quotient groups and quotient spaces.

## Summary

Equivalence relations formalize "classification". They will return when we construct quotient groups in group theory.
