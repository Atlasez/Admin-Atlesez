---
articleId: ja-math-vector-space-introduction
locale: ja
title: 線形空間の定義
slug: vector-space
subject: mathematics
category: linear-algebra
concepts:
  - id: math.linear-algebra.vector-space
    anchor: definition
authors: [atlas-math-team]
reviewers: [example-reviewer]
status: published
createdAt: 2025-05-01
updatedAt: 2026-07-16
summary: 線形空間（ベクトル空間）の公理と基本例を説明します。
difficulty: intermediate
estimatedMinutes: 20
tags: [線形代数, 代数]
aliases: [ベクトル空間, vector space]
exerciseIds:
  pre: [ex-math-vs-pre-1]
  post: []
references:
  - title: 齋藤正彦『線型代数入門』東京大学出版会
---

## 線形空間の定義 {#definition}

体 $K$（例えば実数体 $\mathbb{R}$）上の**線形空間**（ベクトル空間）とは、集合 $V$ に加法 $+ : V \times V \to V$ とスカラー倍 $\cdot : K \times V \to V$ が定義されていて、次を満たすものです。

1. $(V, +)$ はアーベル群である（零ベクトル $\mathbf{0}$ をもつ）
2. $c(\mathbf{u} + \mathbf{v}) = c\mathbf{u} + c\mathbf{v}$
3. $(c + d)\mathbf{v} = c\mathbf{v} + d\mathbf{v}$
4. $(cd)\mathbf{v} = c(d\mathbf{v})$
5. $1\mathbf{v} = \mathbf{v}$

## 基本例

- 数ベクトル空間 $\mathbb{R}^n$
- 実数係数の多項式全体 $\mathbb{R}[x]$
- 区間 $[a, b]$ 上の連続関数全体 $C[a, b]$

いずれも「足せて、スカラー倍できて、公理を満たす」ことが確認できます。

## 部分空間

$V$ の空でない部分集合 $W$ が加法とスカラー倍で閉じているとき、$W$ を**部分空間**といいます。

$$W \ne \emptyset,\quad \mathbf{u}, \mathbf{v} \in W \Rightarrow \mathbf{u} + \mathbf{v} \in W,\quad c \in K, \mathbf{v} \in W \Rightarrow c\mathbf{v} \in W$$

## まとめ

線形空間は「線形結合が自由にできる場所」です。次は線形写像に進み、空間の間の構造を保つ対応を学びます。
