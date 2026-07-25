---
articleId: en-math-sets-and-operations
locale: en
title: Sets and Set Operations
slug: sets-and-operations
subject: mathematics
category: set-theory
concepts:
  - id: math.set-theory.sets
    anchor: sets
  - id: math.set-theory.set-operations
    anchor: operations
authors: [atlas-math-team]
reviewers: [example-reviewer]
status: published
createdAt: 2025-06-01
updatedAt: 2026-07-01
summary: Defines sets and introduces unions, intersections, complements and De Morgan's laws in a single article. (The Japanese edition covers this in two separate articles.)
difficulty: introductory
estimatedMinutes: 30
tags: [sets, foundations]
aliases: [set theory basics]
references:
  - title: P. R. Halmos, "Naive Set Theory"
---

## Sets {#sets}

A **set** is a collection of objects such that, for any object, it is determined whether the object belongs to the collection or not. The objects belonging to a set are called its **elements**; we write $a \in A$.

Sets can be described by listing elements, $A = \{1, 2, 3\}$, or by a defining property, $A = \{x \mid x \text{ is a positive integer} \le 3\}$.

If every element of $A$ is an element of $B$, we call $A$ a **subset** of $B$ and write $A \subset B$. The **empty set** $\emptyset$ has no elements and is a subset of every set.

## Set operations {#operations}

For sets $A$ and $B$ we define:

- **Union**: $A \cup B = \{x \mid x \in A \text{ or } x \in B\}$
- **Intersection**: $A \cap B = \{x \mid x \in A \text{ and } x \in B\}$
- **Difference**: $A \setminus B = \{x \mid x \in A \text{ and } x \notin B\}$
- **Complement** (with respect to a universe $U$): $A^{c} = U \setminus A$

## De Morgan's laws

$$(A \cup B)^{c} = A^{c} \cap B^{c}, \qquad (A \cap B)^{c} = A^{c} \cup B^{c}$$

These follow directly from the logical equivalences between "not (P or Q)" and "(not P) and (not Q)".

## Summary

Set operations mirror logical connectives. This correspondence is the key to fluent proofs in everything that follows.
