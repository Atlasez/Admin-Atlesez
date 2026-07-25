---
articleId: en-math-group-definition
locale: en
title: Definition of a Group
slug: group-definition
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.group-definition
    anchor: definition
authors: [atlas-math-team]
reviewers: [example-reviewer]
status: published
createdAt: 2025-06-20
updatedAt: 2026-07-10
summary: States the group axioms and proves uniqueness of the identity and inverses.
difficulty: basic
estimatedMinutes: 25
tags: [group theory, algebra]
aliases: [group]
references:
  - title: M. A. Armstrong, "Groups and Symmetry"
---

## Definition {#definition}

A **group** is a set $G$ together with a binary operation $\cdot : G \times G \to G$ such that:

1. **Associativity**: $(a \cdot b) \cdot c = a \cdot (b \cdot c)$ for all $a, b, c \in G$
2. **Identity**: there exists $e \in G$ with $e \cdot a = a \cdot e = a$ for all $a \in G$
3. **Inverses**: for every $a \in G$ there exists $b \in G$ with $a \cdot b = b \cdot a = e$

A group whose operation is commutative is called **abelian**.

## Uniqueness of the identity

If $e$ and $e'$ are both identities, then $e = e \cdot e' = e'$.

## Uniqueness of inverses

If $b$ and $c$ are both inverses of $a$, then

$$b = b \cdot e = b \cdot (a \cdot c) = (b \cdot a) \cdot c = e \cdot c = c.$$

We write the unique inverse of $a$ as $a^{-1}$.

## Summary

Three axioms — associativity, identity, inverses — define a group. Next, look at concrete examples and subgroups.
