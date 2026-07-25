---
articleId: ja-mathematics-subring-examples
locale: ja
title: 部分環の例
slug: subring-examples
subject: mathematics
category: ring-theory
concepts:
  - id: math.ring-theory.subring-examples
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  単位的環の単位的部分環 以下は単位的環 の単位的部分環 の例である. 例 1 (有理整数環の単位的部分環) 単位的環 の単位的部分環 が
  を満たすとする. このとき が加法で閉じていることから が従う. 例 2 (多項式…
difficulty: intermediate
estimatedMinutes: 15
tags:
  - 部分環の例
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 単位的環の単位的部分環

以下は単位的環$R$の単位的部分環$(S,1_R)$の例である.

例 1 (有理整数環の単位的部分環) 単位的環$\mathbb{Z}$の単位的部分環$S$が$1\in S$を満たすとする. このとき$S$が加法で閉じていることから$S=\mathbb{Z}$が従う.

例 2 (多項式環の単位的部分環) $R$を単位的可換環とする. $(R,1_{\small R[X]})$は多項式環$R[X]$の単位的部分環である.

例 3 (多項式環の単位的部分環) $R$を単位的可換環とする. $(R[X^2,X^3],1_{\small R[X]})$は多項式環$R[X]$の単位的部分環である. $R[X^2,X^3]$は$1$次の項を持たない多項式全体の集合になっている.

例 4 (ガウス整数環) 複素数体$\mathbb{C}$の部分集合として, ガウス整数環$( \mathbb{Z}[i],1)$

$$
\begin{align*} \mathbb{Z}[i] = \{a + bi \mid a, b \in \mathbb{Z}\} \end{align*}
$$

は$\mathbb{C}$の単位的部分環である. さらに$\mathbb{Z}[i]$は$(\mathbb{Z},1)$を部分環として持つ.

例 5 (上三角行列環, 下三角行列環の単位的部分環) 単位的環$R$上の$n$次全行列環$\mathrm{M}_n(R)$の部分集合

$$
\begin{align*} S=\left\{\begin{pmatrix} x_{11} & x_{12} & \cdots & x_{1n} \\ 0 & x_{22} & \cdots & x_{2n} \\ \vdots & \vdots & \ddots & \vdots \\ 0 & 0 & \cdots & x_{nn} \end{pmatrix}\ \middle|\ x_{ij}\in R\right\} \end{align*}
$$

は$\mathrm{M}_n(R)$の単位的部分環$(S,1_{\mathrm{M}_n(R)})$である. これを$n$次上三角行列環という. 同様に$\mathrm{M}_n(R)$の部分集合

$$
\begin{align*} T=\left\{\begin{pmatrix} x_{11} & 0 & \cdots & 0 \\ x_{21} & x_{22} & \cdots & 0 \\ \vdots & \vdots & \ddots & \vdots \\ x_{n1} & x_{n2} & \cdots & x_{nn} \end{pmatrix}\ \middle|\ x_{ij}\in R\right\} \end{align*}
$$

は$\mathrm{M}_n(R)$の単位的部分環$(T,1_{\mathrm{M}_n(R)})$である. これを$n$次下三角行列環という.

### 単位的環の単位的でない部分環

以下は単位的環$R$の部分環$S$で$1_R\not\in S$となる例である.

例 6 $2\mathbb{Z}$は$\mathbb{Z}$の部分環である. $\mathbb{Z}$は単位元$1$を持つが, $2\mathbb{Z}$は単位元を持たない.

例 7 (単位元が一致しない例) 体$K$上の$2$次全行列環$\mathrm{M}_2(K)$の部分集合

$$
\begin{align*} S=\left\{\begin{pmatrix} x & 0 \\ 0 & 0 \end{pmatrix}\ \middle|\ x\in K\right\} \end{align*}
$$

は$\mathrm{M}_2(K)$の部分環である. $R$は単位行列を乗法単位元に持つが, $S$は

$$
\begin{align*} \begin{pmatrix} 1 & 0 \\ 0 & 0 \end{pmatrix} \end{align*}
$$

を乗法単位元に持つ. これは$\mathrm{M}_2(K)$の乗法単位元とは異なる.

### 単位的でない環の単位的部分環

以下は単位的でない環$R$の部分環$S$で$S$は単位的環となる例である.

例 8 乗法単位元を持たない直積環$R = 2\mathbb{Z} \times \mathbb{Z}$の部分集合

$$
\begin{align*} S = \{(0, n) \mid n \in \mathbb{Z}\} \end{align*}
$$

は$R$の部分環である. $S$は乗法単位元$(0,1)$を持つ.

### 単位的でない環の単位的でない部分環

以下は単位的でない環$R$の部分環$S$で$S$も単位的環でない例である.

例 9 $4\mathbb{Z}$は$2\mathbb{Z}$の部分環である. $2\mathbb{Z}$も$4\mathbb{Z}$も乗法単位元を持たない.
