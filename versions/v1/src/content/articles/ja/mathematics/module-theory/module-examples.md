---
articleId: ja-mathematics-module-examples
locale: ja
title: 環上の加群の例
slug: module-examples
subject: mathematics
category: module-theory
concepts:
  - id: math.module-theory.module-examples
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  例 1 (零加群) 自明な群 に の への作用を で定めることで は左 加群である. 同様に作用を で定めることで は右 加群である.
  これを零加群という. 例 2 (ベクトル空間) 体は特に環でもあるので, 体 上のベ…
difficulty: intermediate
estimatedMinutes: 10
tags:
  - 環上の加群の例
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

例 1 (零加群) 自明な群$\{0\}$に$R$の$\{0\}$への作用を$a0:=0$で定めることで$\{0\}$は左$R$加群である. 同様に作用を$0a:=0$で定めることで$\{0\}$は右$R$加群である. これを零加群という.

例 2 (ベクトル空間) 体は特に環でもあるので, 体$\mathbb{K}$上のベクトル空間$V$は$\mathbb{K}$上の加群と考えることができる. すなわち環上の加群はベクトル空間の一般化である.

例 3 (アーベル群) 任意のアーベル群$G$は環$\mathbb{Z}$上の加群と見なすことができる. 具体的には$x\in G$に対して

$$
\begin{align*} nx:=\begin{cases} \underbrace{x+\cdots +x}_{n\text{個}} & (n>0) \\ 0 & (n=0) \end{cases} \end{align*}
$$

さらに$n<0$に対しては$nx:=-(-n)x$と定めることで, 任意のアーベル群は$\mathbb{Z}$上の加群となる.

例 4 (環自身は加群) $R$を環とすると, 特に$R$は加法によってアーベル群である. また$R$の$R$への作用を$R$における積とすれば$R$は左$R$加群かつ右$R$加群である.

例 5 (多項式環) 多項式環$R[X]$は$R$上の加群である.

例 6 (多項式環上の加群) 体$K$上の線型空間$V$と自己準同型写像$f\colon V\to V$が与えられたとする. このとき, 多項式環$K[X]$の$V$への作用を次のように定めることで$V$は左$K[X]$加群となる.

$$
\begin{align*} \left(\sum_{i=0}^n a_iX^i\right)v:=\sum_{i=0}^n a_i f^i(v) \quad (a_i\in K, v\in V) \end{align*}
$$

ただし$f^0$は恒等写像, $f^i$は$f$の$i$回合成とする.
