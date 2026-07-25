---
articleId: en-math-relations
locale: en
title: Binary Relations
slug: relations
subject: mathematics
category: set-theory
concepts:
  - id: math.set-theory.relations
    anchor: definition
authors: [atlas-math-team]
reviewers: []
status: published
createdAt: 2025-06-10
updatedAt: 2026-07-01
summary: Defines binary relations and the properties of reflexivity, symmetry and transitivity. (In Japanese, relations and equivalence relations are covered in one article.)
difficulty: basic
estimatedMinutes: 15
tags: [relations, foundations]
---

## Definition {#definition}

A **binary relation** on a set $A$ is a subset $R \subset A \times A$. When $(a, b) \in R$ we write $a \mathrel{R} b$.

Examples include the order $\le$ on integers, divisibility $\mid$, and equality $=$.

## Properties

- **Reflexive**: $a \mathrel{R} a$ for all $a$
- **Symmetric**: $a \mathrel{R} b \Rightarrow b \mathrel{R} a$
- **Transitive**: $a \mathrel{R} b$ and $b \mathrel{R} c \Rightarrow a \mathrel{R} c$

## Summary

Relations generalize both orderings and equality. A relation with all three properties above is an equivalence relation, which we study in the next article.
