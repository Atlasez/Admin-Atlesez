---
articleId: ja-mathematics-cyclic-groups
locale: ja
title: 巡回群
slug: cyclic-groups
subject: mathematics
category: group-theory
concepts:
  - id: math.group-theory.cyclic-groups
authors:
  - atlas-math-team
reviewers: []
status: published
createdAt: 2024-01-01
updatedAt: 2026-07-22
summary:
  巡回群 定義 1 (巡回部分群, 巡回群). 群 に対して, ある が存在して となるとき, を巡回群(cyclic group)という.
  また, の部分群で巡回群であるものを の巡回部分群(cyclic subgrou…
difficulty: intermediate
estimatedMinutes: 35
tags:
  - 巡回群
aliases: []
exerciseIds:
  pre: []
  post: []
references: []
---

### 巡回群

定義 1 (巡回部分群, 巡回群). 群$G$に対して, ある$a\in G$が存在して$G=\langle a\rangle$となるとき, $G$を巡回群(cyclic group)という. また, $G$の部分群で巡回群であるものを$G$の巡回部分群(cyclic subgroup)という.

生成系により生成される群の具体的な表示([群の生成系:命題 3])より巡回群$G=\langle a\rangle$の元は整数$i$を用いて$a^i$と表すことができる. ただしこの表示は一意的とは限らない.

### 巡回群はアーベル群

命題 2. 任意の巡回群$G$はアーベル群である.

証明. $G$の生成元を$a\in G$とすると$G$の任意の元は整数$i$を用いて$a^i$と表すことができる. よって$a^i,a^j\in G$に対して

$$
\begin{align*} a^ia^j=a^{i+j}=a^{j+i}=a^ja^i \end{align*}
$$

であるから可換であることが分かる. ◻

### 群の元の位数

定義 3 ((群の元の)位数). 群$G$の巡回部分群$\langle a\rangle\,(a\in G)$について次の二つの場合がある.

- ある整数$n\neq 0$で$a^n=e$となるとき, $a^n=e$を満たす正の整数$n$のうち最小のものを$m$とすると巡回部分群は相異なる$m$個の元で

$$
\begin{align*} \langle a\rangle=\{e,a,a^2,\ldots ,a^{m-1}\} \end{align*}
$$

となる. この$m$を$a$の位数(order)という. このとき$a^n=e$ならば$n$は$m$で割り切れる.

- 任意の整数$n\neq 0$に対して$a^n\neq e$となるとき, 巡回部分群は次の形で表される無限群になる.

$$
\begin{align*} \langle a\rangle=\{\ldots ,a^{-2},a^{-1},e,a^1,a^2,\ldots\} \end{align*}
$$

このとき$a$の位数は$\infty$と定義する.

証明.

- まず巡回群が$\langle a\rangle=\{e,a,a^2,\ldots ,a^{m-1}\}$の形で表示されることを示す. 任意の整数$i$に対して$a^i\in \langle a\rangle$を考える. このとき$i=qm+r\,(0\leq r< m)$となる整数$q,r$が存在して

$$
\begin{align*} a^i=a^{qm+r}=a^{qm}a^r=a^r \end{align*}
$$

となる. さらに$0\leq r_1,r_2<m$に対して$a^{r_1}=a^{r_2}$と仮定すると$a^{r_1-r_2}=e$となり, $|r_1-r_2|<m$なので$m$の最小性より$r_1=r_2$が分かる. よって$\langle a\rangle$は位数$m$の群であることが分かった. また, $a^n=e$のとき$n=qm+r\,(0\leq r< m)$となる整数$q,r$が存在し, $a^n=a^r=e$となる. $m$の最小性より$r=0$である. よって$n=qm$となるので$n$は$m$で割り切れる.

- $a^k=a^l$と仮定すると$a^{k-l}=e$であるが仮定より$k-l=0$である. よって$k\neq l$ならば$a^k\neq a^l$なので, $\langle a\rangle$は無限群であることが分かる.

◻

群の位数([群の定義:定義 8])と用語が同じなので違いに注意する必要がある. 対偶を考えれば次のことも分かる.

系 4 (有限群ならば元の位数は有限). $G$を有限群とする. このとき任意の$a\in G$の位数は$\infty$ではない.

### 巡回群の部分群

命題 5 (巡回群の部分群は巡回群). $G$を巡回群とする. このとき$G$の部分群は巡回群である. 特に$G$が有限群なら$|G|$の任意の約数$d$に対して, 位数$d$の$G$の部分群$H$が存在する.

証明. まず$G$の部分群は必ず巡回群になることを示す. $G=\langle a\rangle$とする. $H$を$G$の部分群とする. $H=\{e\}$は$e$を生成元とする巡回群なので$H\neq \{e\}$で考えればよい. このとき$a^{-m}=(a^m)^{-1}$であることに注意すると$a^m\in H$を満たす正の整数$m$のうち最小のものを取ることができる. すると任意の$a^k\in H$に対して$k=qm+r\,(0\leq r<m)$と表すことができるが$H$は$G$の部分群なので$a^k,a^m\in H$より

$$
\begin{align*} a^r=a^{k-qm}=a^k(a^{-m})^q\in H \end{align*}
$$

である. $m$の最小性より$r=0$である. すなわち任意の$H$の元は$a^{qm}$の形に表されるので$H=\langle a^m\rangle$となり巡回群である.

次に$|G|=n$として$d$を$n$の約数とする. すると$a^{\frac{n}{d}}$に関して

$$
\begin{align*} \left(a^{\frac{n}{d}}\right)^k\neq e\quad (1\leq k\leq d-1),\qquad \left(a^{\frac{n}{d}} \right)^d=e \end{align*}
$$

であるから$H=\langle a^{\frac{n}{d}} \rangle$は位数$d$の$G$の部分群である. ◻

### 巡回群の一意性

巡回群は同型を除いて一意であり, その位数のみで特徴づけられる.

命題 6 (巡回群は同型を除き一意). $G$を位数$n$の巡回群であるとき$G\cong \mathbb{Z}/n\mathbb{Z}$である. $G$が無限巡回群ならば$G\cong \mathbb{Z}$である.

証明. $G$の生成元を$x$とする. $f\colon \mathbb{Z}\to G$を$f(m)=x^m$で定めるとこれは全射準同型写像である. 実際,

$$
\begin{align*} f(m_1+m_2)=x^{m_1+m_2}=x^{m_1}x^{m_2}=f(m_1)f(m_2) \end{align*}
$$

なので準同型写像で全射は$G$が巡回群であることから明らか. また$\mathop{\mathrm{Ker}}f$について, $G$が位数$n$の巡回群であるとき

$$
\begin{align*} m\in\mathop{\mathrm{Ker}}f\iff x^m=e \end{align*}
$$

であって$x^m=e$のとき$m$は$n$で割り切れる. なぜなら$m=qn+r,\,(0\leq r<n)$とすると

$$
\begin{align*} x^m=x^{qn+r}=x^{qn}x^r=x^r=e \end{align*}
$$

なのでこれを満たす$r$は0に限られるからである. 逆に$f(qn)=e$なので$\mathop{\mathrm{Ker}}f=n\mathbb{Z}$. $f$に準同型定理([準同型定理と例:定理 1])を適用すれば同型

$$
\begin{align*} \mathbb{Z}/n\mathbb{Z}\cong G \end{align*}
$$

がわかる. 一方$G$が無限巡回群のとき$x^m=e$を満たす整数$m$は$m=0$に限られる. つまり$\mathop{\mathrm{Ker}}f=\{e\}$なので$f$は全単射であることが分かる. よってこのとき$G\cong \mathbb{Z}$である. ◻

### 巡回群の直積が巡回群となる必要十分条件

命題 7 (巡回群の直積が巡回群となる必要十分条件). $G_1, G_2$をともに非自明な有限巡回群とする. このとき

$$
\begin{align*} G_1\times G_2\text{が巡回群}\iff \text{$|G_1|$と$|G_2|$が互いに素} \end{align*}
$$

証明. [巡回群:命題 6]を用いることで示すことは

$$
\begin{align*} \mathbb{Z}/m\mathbb{Z}\times \mathbb{Z}/n\mathbb{Z}\text{が巡回群}\iff \text{$m$と$n$が互いに素} \end{align*}
$$

とできる. まず$m$と$n$が互いに素であるとき, 次の同型を示す.

$$
\begin{align*} \mathbb{Z}/m\mathbb{Z}\times \mathbb{Z}/n\mathbb{Z}\cong \mathbb{Z}/mn\mathbb{Z} \end{align*}
$$

準同型写像$\pi\colon\mathbb{Z}\to\mathbb{Z}/m\mathbb{Z}\times \mathbb{Z}/n\mathbb{Z}$を$\pi(x)=(x+m\mathbb{Z},x+n\mathbb{Z})$で定める. まず$\pi$が全射であることを示す. 任意に$(x+m\mathbb{Z},y+n\mathbb{Z})\in \mathbb{Z}/m\mathbb{Z}\times \mathbb{Z}/n\mathbb{Z}$を取る. $m,n$は互いに素なので$ma+nb=1$を満たす整数$a,b$が存在する. この$a,b$を用いて

$$
\begin{align*} may+nbx=x+ma(y-x)=y+nb(x-y) \end{align*}
$$

が成り立つので$\pi(may+nbx)=(x+m\mathbb{Z},y+n\mathbb{Z})$となる. よって$\pi$は全射である. また, $\mathop{\mathrm{Ker}}\pi=m\mathbb{Z}\cap n\mathbb{Z}=mn\mathbb{Z}$であるので準同型定理より$\pi$が次の同型を導くことが示された.

$$
\begin{align*} \mathbb{Z}/mn\mathbb{Z}\cong \mathbb{Z}/m\mathbb{Z}\times \mathbb{Z}/n\mathbb{Z} \end{align*}
$$

逆に$\mathbb{Z}/m\mathbb{Z}\times \mathbb{Z}/n\mathbb{Z}$が巡回群であるとする. このとき生成元を$(\overline{a},\overline{b})$とする. $m,n$の最小公倍数を$l$とおくと, $l(\overline{a},\overline{b})=(\overline{0},\overline{0})$であるから$l$は$mn$で割り切れ, $mn\leq L$である. 一方, $m,n$の最大公約数を$g$とすると,

$$
\begin{align*} mn\leq l=\frac{mn}{g} \end{align*}
$$

となる. これを満たす$g$は$g=1$に限られるので$m$と$n$は互いに素である. ◻

上の命題では有限巡回群同士の直積について考察した. 無限巡回群を含む場合を以下の例に示す.

例 8. 二つの無限巡回群の直積$\mathbb{Z}\times \mathbb{Z}$は巡回群ではない. $(m,n)$が$\mathbb{Z}\times \mathbb{Z}$の生成元とすると, $(1,0)=(km,kn)$となる$k\in\mathbb{Z}$が取れる. このとき$n=0$となるが$(m,0)$は$(0,1)\in\mathbb{Z}\times \mathbb{Z}$を生成しないため, $\mathbb{Z}\times \mathbb{Z}$の生成元を一つにとることはできず, 巡回群でない.

例 9. 無限巡回群$\mathbb{Z}$と位数$n\geq 2$の有限巡回群$\mathbb{Z}/n\mathbb{Z}$の直積$\mathbb{Z}\times \mathbb{Z}/n\mathbb{Z}$は巡回群でない. 仮に巡回群だとすると$\mathbb{Z}\times \mathbb{Z}/n\mathbb{Z}$は無限群なので$\mathbb{Z}\times \mathbb{Z}/n\mathbb{Z}\cong \mathbb{Z}$が成り立つ. よって$\mathbb{Z}\times \mathbb{Z}/n\mathbb{Z}$の位数有限の元は単位元$(0,\overline{0})$に限られる. しかし$(0,\overline{1})\in\mathbb{Z}\times \mathbb{Z}/n\mathbb{Z}$は単位元でないが$n(0,\overline{1})=(0,\overline{0})$となり位数$n$であるから, これは矛盾である.
