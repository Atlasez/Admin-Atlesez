---
articleId: ja-math-linear-map
locale: ja
title: 線形写像
slug: linear-map
subject: mathematics
category: linear-algebra
concepts:
  - id: math.linear-algebra.linear-map
    anchor: definition
authors: [atlas-math-team]
reviewers: []
status: published
createdAt: 2025-05-15
updatedAt: 2026-07-16
summary: 線形写像の定義、核と像、行列表現の考え方を説明します。
difficulty: intermediate
estimatedMinutes: 25
tags: [線形代数, 代数]
aliases: [linear map, 一次写像]
references:
  - title: 齋藤正彦『線型代数入門』東京大学出版会
---

## 線形写像の定義 {#definition}

線形空間 $V, W$ の間の写像 $f : V \to W$ が

$$f(\mathbf{u} + \mathbf{v}) = f(\mathbf{u}) + f(\mathbf{v}), \qquad f(c\mathbf{v}) = c f(\mathbf{v})$$

を満たすとき、$f$ を**線形写像**といいます。線形写像は必ず $f(\mathbf{0}) = \mathbf{0}$ を満たします。

## 核と像

- **核**: $\operatorname{Ker} f = \{\mathbf{v} \in V \mid f(\mathbf{v}) = \mathbf{0}\}$ は $V$ の部分空間
- **像**: $\operatorname{Im} f = \{f(\mathbf{v}) \mid \mathbf{v} \in V\}$ は $W$ の部分空間

$f$ が単射であることと $\operatorname{Ker} f = \{\mathbf{0}\}$ は同値です。

## 行列との対応

$V = \mathbb{R}^n$, $W = \mathbb{R}^m$ のとき、線形写像は $m \times n$ 行列 $A$ による $f(\mathbf{x}) = A\mathbf{x}$ とちょうど一対一に対応します。基底を選ぶことで、一般の有限次元線形空間の線形写像も行列で表せます。

## まとめ

線形写像は群論の準同型写像の線形空間版です。核・像・行列表現は、固有値やジョルダン標準形へ進むための基礎になります。
