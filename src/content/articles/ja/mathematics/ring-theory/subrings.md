---
articleId: ja-mathematics-subrings
locale: ja
title: 部分環の定義
slug: subrings
subject: mathematics
category: ring-theory
concepts:
  - id: math.ring-theory.subrings
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  部分環の定義 ここではまず部分環の定義を行い, より簡潔な必要十分条件を示す. そして部分環の共通部分,
  和集合が部分環となる条件について触れる. 定義 1 (部分環) が環 の部分環(subring)であるとは, の部…
difficulty: intermediate
estimatedMinutes: 20
tags:
  - 部分環の定義
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 部分環の定義

ここではまず部分環の定義を行い, より簡潔な必要十分条件を示す. そして部分環の共通部分, 和集合が部分環となる条件について触れる.

定義 1 (部分環) $S$が環$R$の部分環(subring)であるとは, $R$の部分集合$S$が$R$の演算によって環をなす, すなわち$R$における和と積の$S$における制限$+|_S,\ \cdot|_S$によって$(S,+|_S,\cdot|_S)$が環となることである.

$S$を$R$の部分環とするとき, アーベル群$(S,+)$は$(R,+)$の部分群である. よって部分群の基本的性質から$S$の加法単位元は$R$の加法単位元と一致し, $S$の加法逆元も$R$の加法逆元と一致することが従う. 一方, 単位的環$R$の部分環$S$は単位的環とは限らず, $S$が乗法単位元を持っていても, それが$R$の乗法単位元と一致するとは限らない.

一般的に単位的環$R$の部分環$S$と言えば, $S$は$R$の演算で単位的環であり$1_R\in S$であるもの, したがって$1_R$が$S$の乗法単位元であるものを指すことが多い. このような部分環を明示的に区別するために, 単位的部分環$(S,1_R)$のように書くことにする.

### 部分環であることの同値な条件

命題 2 環$R$の部分集合$S$が$R$の部分環である必要十分条件は, 以下の条件が成り立つことである.

- $S$は空集合でない.

- $\forall x,y\in S,\ x-y\in S$.

- $\forall x\in S,\ xy\in S$.

証明. $S$が$R$の部分環であれば, 1. 2. 3. は成り立つ. 逆に1. 2. 3. が成り立つとき, [部分群の定義:命題5]より1. 2.から$(S,+)$は$(R,+)$の部分群である. さらに3. より$S$は積について閉じているから$S$は$R$の部分環である. ◻

### 部分環の共通部分と和集合

以下では部分環の集合としての演算が部分環となる条件について考える.

命題 3 (部分環の共通部分は部分環) $\{S_{\lambda}\}_{\lambda\in\Lambda}$を$R$の部分環の族とする. このときこれらの共通部分$\bigcap_{\lambda\in\Lambda}S_{\lambda}$は$R$の部分環である.

証明. $x,y\in \bigcap_{\lambda\in\Lambda}S_{\lambda}$とすると, 各$S_{\lambda}$は$R$の部分環なので任意の$\lambda\in\Lambda$に対して$x-y\in S_{\lambda}$および$xy\in S_{\lambda}$である. したがって$x-y, xy \in \bigcap_{\lambda\in\Lambda}S_{\lambda}$となり, 命題1.4.2より$\bigcap_{\lambda\in\Lambda}S_{\lambda}$は$R$の部分環である. ◻

特に各$\lambda\in\Lambda$に対して$S_{\lambda}$が$R$の単位的部分環$(S_{\lambda},1_R)$であるならば$1_R\in \bigcap_{\lambda\in\Lambda}S_{\lambda}$であり, $(\bigcap_{\lambda\in\Lambda}S_{\lambda},1_R)$は$R$の単位的部分環である.

命題 4 (部分環の和集合が部分環になる必要十分条件) $S_1,S_2$を$R$の部分環とする. このとき次が成り立つ.

$$
\begin{align*} S_1\cup S_2\text{が$R$の部分環}\iff S_1\subset S_2\text{または}S_1\supset S_2 \end{align*}
$$

証明. $S_1\subset S_2$のとき$S_1\cup S_2=S_2$, $S_1\supset S_2$のとき$S_1\cup S_2=S_1$より$S_1\cup S_2$が$R$の部分環になることは直ちに従う. 次に$S_1\cup S_2$が$R$の部分環であると仮定する. 背理法で示す. $S_1\not\subset S_2$かつ$S_1\not\supset S_2$とすると, ある$s_1\in S_1, s_2\in S_2$で$s_1\not\in S_2, s_2\not\in S_1$となるものが存在する. $s_1,s_2\in S_1\cup S_2$なので, 部分環は加法について閉じていることから$s_1+s_2\in S_1\cup S_2$である. しかし$s_1+s_2\in S_1$とすると, $S_1$は加法群であるから$s_2=(s_1+s_2)-s_1\in S_1$となり矛盾. 同様に$s_1+s_2\in S_2$とすると, $s_1=(s_1+s_2)-s_2\in S_2$となり矛盾. 以上より$S_1\subset S_2$または$S_1\supset S_2$である. ◻
